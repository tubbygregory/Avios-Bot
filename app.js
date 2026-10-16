const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const messagesEl = document.getElementById('messages');
const sendButton = document.getElementById('send-button');
const suggestions = document.getElementById('suggestions');
const clearChatButton = document.getElementById('clear-chat');
const authButton = document.getElementById('puter-auth');
const profileInputs = [...document.querySelectorAll('[data-profile]')];
const baAmex = document.getElementById('ba-amex');
const baPremium = document.getElementById('ba-premium');
const barclaycardAvios = document.getElementById('barclaycard-avios');
const barclaycardPlus = document.getElementById('barclaycard-plus');
const revolut = document.getElementById('revolut');
const revolutPlan = document.getElementById('revolut-plan');
const revolutPlanRow = document.getElementById('revolut-plan-row');
const activeProfileChips = document.getElementById('active-profile-chips');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const ownAiPanel = document.getElementById('own-ai-panel');
const providerButtons = [...document.querySelectorAll('[data-provider]')];
const toast = document.getElementById('toast');
const promptRecovery = document.getElementById('prompt-recovery');
const generatedPrompt = document.getElementById('generated-prompt');
const handoffStatus = document.getElementById('handoff-status');
const copyPromptButton = document.getElementById('copy-prompt');
const openProvider = document.getElementById('open-provider');
const sdkStatus = document.getElementById('sdk-status');

const PROFILE_KEY = 'avios-optimiser-profile-v2';
const MODEL = 'perplexity/sonar-pro-search';
const MAX_HISTORY_TURNS = 8;
let conversation = [];
let busy = false;
let activeOperation = null;
let lastExternalRequest = '';
const AI_MODE_KEY = 'aviosmaxxing-ai-mode';
const AI_PROVIDER_KEY = 'aviosmaxxing-ai-provider';
const PROVIDERS = {
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { label: 'Claude', url: 'https://claude.ai/' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/' }
};
let currentMode = 'puter';
let currentProvider = 'chatgpt';
let toastTimer = null;
let toastHideTimer = null;

const EXAMPLE_PROMPTS = [
  { label: 'Upgrade my iPhone 16', prompt: 'I want an upgrade to my phone. I currently have an iPhone 16.' },
  { label: 'Dinner out in London', prompt: 'Dinner out in London' },
  { label: 'Buy a specific watch', prompt: 'Sternglas Hamburg Pro Automatik Alabaster' },
  { label: 'A laptop for about £1,000', prompt: 'I need a good laptop for about £1,000. What should I buy?' },
  { label: 'Weekend hotel in Edinburgh', prompt: 'I need a hotel in Edinburgh for a weekend away. What is a good option and how should I book it?' },
  { label: 'New noise-cancelling headphones', prompt: 'I want some really good noise-cancelling headphones.' },
  { label: 'A meal near Soho', prompt: 'I want a nice dinner near Soho, around £50 a head.' },
  { label: 'Replace my washing machine', prompt: 'I need to replace my washing machine and want to spend under £500.' },
  { label: 'Book a trip to New York', prompt: 'I want to go to New York later this year. What is the smartest way to book it for Avios?' },
  { label: 'A new TV for the living room', prompt: 'I need a new TV for my living room, ideally around £800.' },
  { label: 'Something fun this weekend', prompt: 'Something fun to do in London this weekend.' },
  { label: 'Upgrade my coffee setup', prompt: 'I want to upgrade my coffee setup at home. I have about £500 to spend.' },
  { label: 'Buy an Apple MacBook Air', prompt: 'Apple MacBook Air 13-inch' },
  { label: 'Affordable train trip', prompt: 'I want a cheap weekend away by train from London.' },
  { label: 'A really good winter coat', prompt: 'I need a really good winter coat that will last.' },
  { label: 'Dinner before a West End show', prompt: 'Dinner before a West End show for two people.' },
  { label: 'New mattress', prompt: 'I need a new mattress. I want something genuinely good, not just the cheapest.' },
  { label: 'Airport parking', prompt: 'I need airport parking at Heathrow for a week. What is the best way to book it?' }
];

function shuffledExamples() {
  const items = [...EXAMPLE_PROMPTS];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, 3);
}

function populateExamplePrompts() {
  const storageKey = 'aviosmaxxing-last-examples';
  let previous = '';
  try { previous = sessionStorage.getItem(storageKey) || ''; } catch (_) {}

  let chosen = shuffledExamples();
  let signature = chosen.map((item) => item.label).sort().join('|');
  for (let attempt = 0; attempt < 8 && signature === previous; attempt += 1) {
    chosen = shuffledExamples();
    signature = chosen.map((item) => item.label).sort().join('|');
  }

  // Guarantee that an ordinary reload does not show the identical trio again.
  if (previous && signature === previous) {
    const previousLabels = new Set(previous.split('|'));
    const replacement = EXAMPLE_PROMPTS.find((item) => !previousLabels.has(item.label));
    if (replacement) {
      chosen[0] = replacement;
      signature = chosen.map((item) => item.label).sort().join('|');
    }
  }

  try { sessionStorage.setItem(storageKey, signature); } catch (_) {}
  suggestions.innerHTML = '';
  chosen.forEach(({ label, prompt }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.prompt = prompt;
    button.textContent = label;
    suggestions.appendChild(button);
  });
}


function showToast(message, tone = 'default') {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  window.clearTimeout(toastHideTimer);
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
    toastHideTimer = window.setTimeout(() => { toast.hidden = true; }, 180);
  }, 4200);
}

function setMode(mode, persist = true) {
  currentMode = mode === 'own' ? 'own' : 'puter';
  modeButtons.forEach((button) => {
    const selected = button.dataset.mode === currentMode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (ownAiPanel) ownAiPanel.hidden = currentMode !== 'own';
  sdkStatus.hidden = currentMode !== 'puter' || Boolean(window.puter);
  input.placeholder = currentMode === 'own'
    ? `What should ${PROVIDERS[currentProvider].label} help you maximise?`
    : 'What are you looking for?';
  if (persist) {
    try { localStorage.setItem(AI_MODE_KEY, currentMode); } catch (_) {}
  }
}

function setProvider(provider, persist = true) {
  if (!Object.hasOwn(PROVIDERS, provider)) provider = 'chatgpt';
  currentProvider = provider;
  providerButtons.forEach((button) => {
    const selected = button.dataset.provider === currentProvider;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (currentMode === 'own') {
    input.placeholder = `What should ${PROVIDERS[currentProvider].label} help you maximise?`;
  }
  if (!promptRecovery.hidden) {
    openProvider.href = PROVIDERS[currentProvider].url;
    openProvider.textContent = `Open ${PROVIDERS[currentProvider].label}`;
    handoffStatus.textContent = `Your prompt is ready below. Copy it, then open ${PROVIDERS[currentProvider].label}.`;
  }
  if (persist) {
    try { localStorage.setItem(AI_PROVIDER_KEY, currentProvider); } catch (_) {}
  }
}

function loadAiPreferences() {
  let savedMode = 'puter';
  let savedProvider = 'chatgpt';
  try {
    savedMode = localStorage.getItem(AI_MODE_KEY) || 'puter';
    savedProvider = localStorage.getItem(AI_PROVIDER_KEY) || 'chatgpt';
  } catch (_) {}
  setProvider(savedProvider, false);
  setMode(savedMode, false);
}

function conversationContextForExternalAi() {
  if (!conversation.length) return 'No previous conversation context.';
  return conversation.slice(-6).map((turn) => {
    const speaker = turn.role === 'assistant' ? 'AVIOSMAXXING' : 'USER';
    return `${speaker}: ${turn.content}`;
  }).join('\n\n');
}

function buildExternalAiPrompt(cleaned) {
  const profile = getProfile();
  return `Act as Aviosmaxxing, a UK shopping, booking and rewards research assistant. The user wants a useful recommendation first, then the most sensible verified route to maximise Avios on the spend.

USER REWARDS
${profileDescription(profile)}

CONVERSATION CONTEXT
${conversationContextForExternalAi()}

CURRENT USER REQUEST
${cleaned}

HOW TO HANDLE IT
- Interpret the request conversationally and infer the real goal before researching. Do not treat it as a literal keyword search.
- Default to UK availability and GBP unless the user says otherwise.
- If this is an upgrade, benchmark against what the user already owns and recommend only meaningful upgrades; never recommend the same item back as an "upgrade".
- If this is a broad category, recommend 2–4 genuinely suitable current options, then optimise the buying route for the strongest choices.
- If this is an exact product, focus on current credible UK sellers and purchase routes rather than spending the answer describing the product.
- If this is dining, travel, an experience or another service, recommend suitable current options and investigate the best legitimate rewards route for booking and paying.
- Use live web search/browsing if your account supports it. Search current retailer/venue prices, BA Shopping/Avios collection opportunities, relevant loyalty programmes and direct official sources where possible.
- Use only the reward products listed above when calculating the user's existing earnings. You may mention one especially relevant additional scheme separately, but do not assume the user has it.
- Treat BA Amex vs BA Amex Premium Plus, and Barclaycard Avios vs Barclaycard Avios Plus, as alternative cards within each family. The user may hold an Amex and a Barclaycard at the same time: compare which selected card is best for the payment, but do not add two cards' base earnings to one transaction.
- If Revolut is selected, use the stated plan when checking RevPoints. If Membership Rewards is selected without an exact Amex card, do not invent a card earning rate.
- Consider selected Heathrow Rewards and hotel programmes (Marriott Bonvoy, IHG One Rewards, ALL Accor) when relevant, distinguishing direct Avios from convertible programme points and avoiding double-counting mutually exclusive earning choices.
- Verify reward rates and stackability. Never invent a BA Shopping rate, promotion, gift-card stacking route or loyalty conversion.
- Include the user's eligible card earnings as well as portal/partner earnings and show the arithmetic clearly.
- Distinguish "best overall value" from "maximum Avios" when they are different. If paying more earns more Avios, calculate the effective extra cost per extra Avios where possible.
- Complete the research now rather than saying you could compare prices or rewards later.
- Give direct source links for the most important price and rewards claims.
- If live search is unavailable to you, say so clearly and do not pretend current prices or reward rates are verified.

OUTPUT
Lead with the recommendation. Then give a concise comparison of the best routes, an Avios/rewards breakdown, any important caveats, and direct sources. Keep the focus on what the user should actually do.`;
}

function refreshExternalPrompt() {
  if (!lastExternalRequest || promptRecovery.hidden) return;
  generatedPrompt.value = buildExternalAiPrompt(lastExternalRequest);
  handoffStatus.textContent = 'Your rewards changed. Copy the updated prompt before sending it to your assistant.';
}

// Bound local waits without pretending to cancel work already sent to Puter.
function waitFor(promise, signal, milliseconds, message) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    // Attach handlers even if already aborted so late rejections are consumed.
    Promise.resolve(promise).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); }
    );
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error(message)); }, milliseconds);
  });
}

async function copyText(text, signal) {
  try {
    await waitFor(navigator.clipboard.writeText(text), signal, 4000, 'Clipboard timed out.');
    return true;
  } catch (_) {
    signal.throwIfAborted();
    const previousFocus = document.activeElement;
    const area = document.createElement('textarea');
    try {
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'clipboard-buffer';
      document.body.appendChild(area);
      area.select();
      return document.execCommand('copy');
    } catch (_) {
      return false;
    } finally {
      area.remove();
      previousFocus?.focus({ preventScroll: true });
    }
  }
}

async function sendToExternalAi(message) {
  const cleaned = message.trim();
  if (!cleaned || busy) return;

  const operation = new AbortController();
  activeOperation = operation;
  setBusy(true);
  const provider = PROVIDERS[currentProvider];
  const prompt = buildExternalAiPrompt(cleaned);
  lastExternalRequest = cleaned;
  generatedPrompt.value = prompt;
  openProvider.href = provider.url;
  openProvider.textContent = `Open ${provider.label}`;
  promptRecovery.hidden = false;
  handoffStatus.textContent = 'Preparing your prompt…';

  let tab = null;
  try {
    // Open and navigate during the gesture; clipboard permissions must not delay it.
    // The destination comes only from the fixed provider list above.
    try {
      tab = window.open('about:blank', '_blank');
      if (tab) {
        tab.opener = null;
        tab.location.replace(provider.url);
      }
    } catch (_) {
      try { tab?.close(); } catch (_) {}
      tab = null;
    }
    const copied = await copyText(prompt, operation.signal);
    if (activeOperation !== operation) return;
    const copyStatus = copied ? 'Prompt copied.' : 'Automatic copying was unavailable. Select and copy the prompt below.';
    const tabStatus = tab ? `Paste it into ${provider.label} and send it there.` : `The new tab was blocked. Use “Open ${provider.label}” below.`;
    handoffStatus.textContent = `${copyStatus} ${tabStatus}`;
    showToast(handoffStatus.textContent, copied && tab ? 'default' : 'error');
    // Keep the original question for retry when either step failed.
    if (copied && tab) {
      input.value = '';
      autoGrow();
    }
  } catch (error) {
    if (activeOperation === operation && error?.name !== 'AbortError') {
      handoffStatus.textContent = 'Select and copy the prompt below, then open your assistant.';
    }
  } finally {
    if (activeOperation === operation) {
      activeOperation = null;
      setBusy(false);
    }
  }
}

function handleQuery(message) {
  if (currentMode === 'own') return sendToExternalAi(message);
  return sendMessage(message);
}

function loadProfile() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    profileInputs.forEach((el) => {
      el.checked = stored?.[el.dataset.profile] === true;
    });
    if ([...revolutPlan.options].some(option => option.value === stored?.revolutPlan)) {
      revolutPlan.value = stored.revolutPlan;
    }
  } catch (_) {}
  // Conflicting saved cards cannot establish eligibility for either variant.
  let conflict = false;
  for (const [standard, premium] of [[baAmex, baPremium], [barclaycardAvios, barclaycardPlus]]) {
    if (standard.checked && premium.checked) {
      standard.checked = premium.checked = false;
      conflict = true;
    }
  }
  if (conflict) {
    document.getElementById('profile-status').textContent = 'Some saved cards conflicted. Please select the card you hold in each family.';
  }
  updateRewardControls();
}

function saveProfile() {
  const profile = getProfile();
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    document.getElementById('profile-status').textContent = '';
  } catch (_) {
    showToast('Your rewards work for this visit, but this browser could not save them.', 'error');
    document.getElementById('profile-status').textContent = 'Your browser could not save these rewards. They still apply for this visit.';
  }
}

function getProfile() {
  const profile = Object.fromEntries(profileInputs.map((el) => [el.dataset.profile, el.checked]));
  profile.revolutPlan = revolutPlan ? revolutPlan.value : 'Standard';
  return profile;
}

function profileDescription(profile) {
  const selected = [];
  if (profile.baAmex) selected.push('British Airways American Express Credit Card (standard/free BA Amex)');
  if (profile.baPremium) selected.push('British Airways American Express Premium Plus Card');
  if (profile.barclaycardAvios) selected.push('Barclaycard Avios');
  if (profile.barclaycardPlus) selected.push('Barclaycard Avios Plus');
  if (profile.nectar) selected.push('Nectar');
  if (profile.revolut) selected.push(`Revolut / RevPoints (${profile.revolutPlan || 'Standard'} plan)`);
  if (profile.bpme) selected.push('BPme Rewards');
  if (profile.uber) selected.push('Uber');
  if (profile.membershipRewards) selected.push('American Express Membership Rewards');
  if (profile.heathrowRewards) selected.push('Heathrow Rewards');
  if (profile.marriottBonvoy) selected.push('Marriott Bonvoy');
  if (profile.ihgOneRewards) selected.push('IHG One Rewards');
  if (profile.allAccor) selected.push('ALL - Accor Live Limitless');
  return selected.length ? selected.join(', ') : 'No listed rewards products selected';
}

function profileLabels(profile = getProfile()) {
  const selected = [];
  if (profile.baAmex) selected.push('BA Amex');
  if (profile.baPremium) selected.push('BA Amex Premium Plus');
  if (profile.barclaycardAvios) selected.push('Barclaycard Avios');
  if (profile.barclaycardPlus) selected.push('Barclaycard Avios Plus');
  if (profile.nectar) selected.push('Nectar');
  if (profile.revolut) selected.push(`Revolut ${profile.revolutPlan || 'Standard'}`);
  if (profile.bpme) selected.push('BPme');
  if (profile.uber) selected.push('Uber');
  if (profile.membershipRewards) selected.push('Membership Rewards');
  if (profile.heathrowRewards) selected.push('Heathrow Rewards');
  if (profile.marriottBonvoy) selected.push('Marriott Bonvoy');
  if (profile.ihgOneRewards) selected.push('IHG One Rewards');
  if (profile.allAccor) selected.push('ALL Accor');
  return selected;
}

function updateRewardControls() {
  if (revolutPlanRow) revolutPlanRow.hidden = !revolut?.checked;
}

function renderProfileChips(container, profile = getProfile(), className = 'profile-chip') {
  if (!container) return;
  container.innerHTML = '';
  const labels = profileLabels(profile);
  if (!labels.length) {
    const chip = document.createElement('span');
    chip.className = `${className} none`;
    chip.textContent = 'No rewards selected';
    container.appendChild(chip);
    return;
  }
  labels.forEach((label) => {
    const chip = document.createElement('span');
    chip.className = className;
    chip.textContent = label;
    container.appendChild(chip);
  });
}

function updateProfileSummary() {
  renderProfileChips(activeProfileChips, getProfile());
}

function systemPrompt(profile) {
  return `You are Aviosmaxxing, a specialist UK spend-and-rewards assistant. Your job is to understand what the user is actually trying to achieve, then use live research to recommend a good choice AND the best sensible route to maximise Avios.

USER REWARD PROFILE
${profileDescription(profile)}

CORE BEHAVIOUR
- Interpret the user's message conversationally. Do not treat it as a literal keyword search.
- First infer the underlying goal: buy something, replace something, upgrade something, book travel, eat out, choose an experience, pay for a service, or compare ways of spending.
- Use the conversation history. Short follow-ups such as "something cheaper", "what about John Lewis?", "near Soho", or "I want something better" refer to the current discussion unless context clearly says otherwise.
- Make sensible assumptions when the request is broad and give the user a useful answer immediately. Do not force a clarification before doing useful research unless the request is genuinely impossible to act on.
- The user is normally in the United Kingdom. Default to UK availability, GBP pricing and UK reward programmes unless they say otherwise.

INTENT EXAMPLES — FOLLOW THESE PRINCIPLES
1. EXACT PRODUCT
   User: "Sternglas Hamburg Pro Automatik Alabaster"
   Meaning: find the best credible UK route to buy that exact item, comparing current price and Avios earning.
   Do NOT spend the answer describing the product unless a specification matters to identifying the correct listing.

2. UPGRADE / REPLACEMENT
   User: "An upgrade to my phone. Currently I have an iPhone 16."
   Meaning: identify what would be a meaningful upgrade from the CURRENT device, recommend strong current options, then optimise the buying route for those options.
   - Establish from live research what the current/newer product generation is.
   - Do NOT recommend the same base product the user already owns as an upgrade.
   - Do NOT recommend a clearly inferior or equivalent product unless you explicitly explain a compelling reason.
   - Compare improvements that matter: performance, camera, battery, display, size, ecosystem, longevity and price as relevant.
   - If a higher-tier version of the same generation might genuinely be an upgrade, explain why rather than treating the shared model number as enough.

3. BROAD CATEGORY
   User: "I need a laptop" or "a decent coffee machine under £500"
   Meaning: recommend 2–4 genuinely suitable current products, then research the best purchase route for each. Lead with the best overall choice.

4. EXPERIENCE / DINING / SERVICE
   User: "Dinner out in London"
   Meaning: recommend a small number of good current options AND investigate how the user can earn the most useful rewards when booking/paying for that spend.
   - If no cuisine, neighbourhood or budget is given, make reasonable London assumptions and offer varied strong options rather than asking a question before helping.
   - Consider relevant booking platforms, restaurant groups, gift-card routes, selected payment cards, Uber where transport is relevant, Nectar where genuinely applicable, and any current Avios-linked route that can be verified.
   - Do not pretend every restaurant spend has a special Avios portal route. If the only verified earning is the user's card, say so clearly.

5. OTHER SPEND
   For hotels, flights, appliances, clothes, tickets, utilities, subscriptions or other services, adapt the same principle: recommend what best meets the user's goal, then optimise the purchase/booking/payment route.

RESEARCH WORKFLOW
- Use live web search for any answer involving current products, prices, venues, offers, stock, reward rates or programme rules.
- Search beyond the first obvious result. For products, find the manufacturer's current price and several credible UK retailers when practical.
- For recommendations, verify that the suggested option actually improves on or fits the user's stated situation.
- Investigate relevant Avios / British Airways Shopping, retailer, payment-card, convertible-points, hotel-loyalty, Nectar, BPme, Uber and Heathrow routes based on the user's selected rewards.
- Prefer official retailer and reward-programme sources for prices, earning rates, exclusions and stacking rules.
- Use comparison/search sources to discover possibilities, then verify at the actual retailer where possible.
- Do not invent a price, Avios rate, stock status, promotion, conversion rate, booking benefit or stacking rule.
- If an Avios Shopping rate is hidden behind sign-in or cannot be verified, label it unverified and do not include it in the numeric Avios total.
- If there is no special portal route, still give a concrete recommendation using verified card/base earnings.

REWARD RULES
- Automatically use the USER REWARD PROFILE above in every recommendation.
- Only count schemes the user has selected. You may briefly flag a particularly valuable additional scheme as optional, but do not include it in their total as though they already have it.
- Treat BA Amex and BA Amex Premium Plus as mutually exclusive.
- Treat Barclaycard Avios and Barclaycard Avios Plus as mutually exclusive.
- The user may legitimately hold an Amex and a Barclaycard at the same time; compare which selected payment card is best for the transaction rather than combining multiple cards' base earnings on one payment.
- If Revolut is selected, use the stated Revolut plan when researching RevPoints earning. Verify the current earning rule for that plan rather than relying on memory.
- If American Express Membership Rewards is selected but the exact Amex card is not known, do not invent a card earn rate. Use verified information where possible and clearly state when the specific card is needed for exact arithmetic.
- For Marriott Bonvoy, IHG One Rewards, ALL Accor and Heathrow Rewards, investigate them when relevant to the spend and verify whether the route earns programme points, direct Avios, or convertible points. Do not double-count mutually exclusive earning choices.
- Verify current card and loyalty earning rates rather than relying on memory.
- Distinguish direct Avios from convertible rewards such as Nectar, RevPoints, Membership Rewards, Heathrow Rewards and hotel points.
- Check whether rewards stack before adding them together.
- Watch for exclusions around gift cards, voucher codes, marketplace sellers, education pricing, refurbished goods, financing, subscriptions and other special categories.

DECISION LOGIC
- Optimise for the user's actual goal first, not raw Avios at any cost.
- When useful, distinguish:
  • Best overall — the option/route you recommend.
  • Cheapest — lowest credible cash cost.
  • Most Avios — highest verified Avios earning.
- If the higher-Avios route costs more, calculate the effective cost of the EXTRA Avios: (extra cash cost / extra Avios) × 100 pence.
- Never imply Avios have a guaranteed cash value.
- Do not recommend paying substantially more merely to collect points without explaining the trade-off.

ANSWER STYLE
- Be concise and decision-oriented. Do not drown the user in background information.
- Start by answering what they actually asked.
- For an exact item, normally use: Best route → Alternatives → Avios calculation → What to do.
- For a broad recommendation, normally use: Best picks → Best Avios route for each → Recommendation.
- For dining/experiences, normally use: Best options → How to book/pay → Recommendation.
- Adapt the headings to the task rather than forcing irrelevant sections.
- Show the arithmetic behind claimed Avios totals.
- Include direct Markdown links to the most useful product, retailer, venue and reward sources used.
- Do not end by offering to perform the core research later. Perform it now.

FINAL CHECK BEFORE RESPONDING
Ask yourself:
1. Did I understand the user's underlying intent rather than just echoing their keywords?
2. If this is an upgrade, are my recommendations genuinely upgrades from what they already have?
3. Have I recommended a good product/venue/service, not merely the one with the most points?
4. Have I actually explained the best verified way for THIS user's selected rewards to buy/book/pay?
If any answer is no, continue researching before responding.

Prices, availability and reward offers change, so remind the user briefly to verify the final rate before checkout.`;
}

profileInputs.forEach((el) => {
  el.addEventListener('change', () => {
    if (el === baAmex && el.checked) baPremium.checked = false;
    if (el === baPremium && el.checked) baAmex.checked = false;
    if (el === barclaycardAvios && el.checked) barclaycardPlus.checked = false;
    if (el === barclaycardPlus && el.checked) barclaycardAvios.checked = false;
    updateRewardControls();
    saveProfile();
    updateProfileSummary();
    refreshExternalPrompt();
  });
});

if (revolutPlan) {
  revolutPlan.addEventListener('change', () => {
    saveProfile();
    updateProfileSummary();
    refreshExternalPrompt();
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch (_) {
    return null;
  }
}

function formatPlainInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function formatInline(text) {
  const raw = String(text || '');
  const tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
  let html = '';
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(raw)) !== null) {
    html += formatPlainInline(raw.slice(lastIndex, match.index));
    const label = match[1];
    const url = safeUrl(match[2] || match[3]);
    if (!url) {
      html += formatPlainInline(match[0]);
    } else {
      const display = label || url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)}</a>`;
    }
    lastIndex = match.index + match[0].length;
  }

  html += formatPlainInline(raw.slice(lastIndex));
  return html;
}

function extractSourceUrls(text) {
  const urls = [];
  const seen = new Set();
  const regex = /\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
  let match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    const url = safeUrl(match[1] || match[2]);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls.slice(0, 8);
}

function renderAssistantText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let html = '';
  let listType = null;

  const closeList = () => {
    if (listType) html += `</${listType}>`;
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (/^###\s+/.test(line)) {
      closeList();
      html += `<h3>${formatInline(line.replace(/^###\s+/, ''))}</h3>`;
      continue;
    }

    if (/^##\s+/.test(line)) {
      closeList();
      html += `<h3>${formatInline(line.replace(/^##\s+/, ''))}</h3>`;
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)/);
    const numbered = line.match(/^\d+[.)]\s+(.+)/);
    if (bullet || numbered) {
      const nextType = bullet ? 'ul' : 'ol';
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html += `<${listType}>`;
      }
      html += `<li>${formatInline((bullet || numbered)[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${formatInline(line)}</p>`;
  }

  closeList();
  return html;
}

function addMessage(role, text, profileSnapshot = null) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (role === 'assistant') {
    const profile = profileSnapshot || getProfile();
    const profileRow = document.createElement('div');
    profileRow.className = 'answer-profile';
    const label = document.createElement('span');
    label.className = 'answer-profile-label';
    label.textContent = 'Your rewards';
    profileRow.appendChild(label);
    const labels = profileLabels(profile);
    if (!labels.length) {
      const chip = document.createElement('span');
      chip.className = 'answer-profile-chip none';
      chip.textContent = 'None selected';
      profileRow.appendChild(chip);
    } else {
      labels.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = 'answer-profile-chip';
        chip.textContent = item;
        profileRow.appendChild(chip);
      });
    }
    bubble.appendChild(profileRow);

    const content = document.createElement('div');
    content.className = 'answer-content';
    content.innerHTML = renderAssistantText(text);
    bubble.appendChild(content);
  } else {
    bubble.textContent = text;
  }

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function addTyping() {
  const row = document.createElement('div');
  row.className = 'message assistant';
  row.innerHTML = '<div class="bubble"><span class="typing" aria-hidden="true"><span></span><span></span><span></span></span><span class="research-status">Connecting to Puter…</span></div>';
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  authButton.disabled = value;
  [...modeButtons, ...providerButtons, ...profileInputs, revolutPlan, copyPromptButton,
    ...suggestions.querySelectorAll('button')].forEach(control => { control.disabled = value; });
  form.setAttribute('aria-busy', String(value));
  sendButton.setAttribute('aria-label', value ? 'Working' : 'Send');
}

function getResponseText(response) {
  const content = response?.message?.content ?? response?.content ?? response;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function friendlyPuterError(error) {
  const detail = error?.error && typeof error.error === 'object' ? error.error : error;
  const code = String(detail?.error || detail?.code || '').toLowerCase();
  const message = String(detail?.msg || detail?.message || (typeof detail === 'string' ? detail : '')).trim();
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes('auth_window_closed') || combined.includes('cancel')) {
    return 'Puter sign-in was cancelled. Your search was not sent. Try again when you are ready to connect.';
  }
  if (combined.includes('popup_blocked')) {
    return 'Your browser blocked the Puter sign-in window. Allow pop-ups for this site and try again.';
  }
  if (combined.includes('timed out') || combined.includes('timeout')) {
    return message || 'Puter timed out. Check your connection and try again, or switch to “Use your AI”.';
  }
  if (combined.includes('allowance') || combined.includes('quota') || combined.includes('billing') || combined.includes('payment') || combined.includes('insufficient')) {
    return 'Puter reports an allowance or billing limit. Check your Puter account for the current limit and any reset or payment options. You can also switch to “Use your AI”.';
  }
  if (combined.includes('rate_limit') || combined.includes('rate limit') || combined.includes('too many requests') || combined.includes('429')) {
    return 'Puter is limiting requests. Wait a little before trying again, or switch to “Use your AI”.';
  }
  if (message) return `Puter could not complete the search: ${message}`;
  return 'Puter could not complete the search. Please try again.';
}

async function updateAuthUI() {
  if (!window.puter) {
    authButton.textContent = 'Unavailable';
    authButton.disabled = true;
    return;
  }

  try {
    if (puter.auth.isSignedIn()) {
      authButton.textContent = 'Connected';
      authButton.classList.add('connected');
    } else {
      authButton.textContent = 'Connect';
      authButton.classList.remove('connected');
    }
  } catch (_) {
    authButton.textContent = 'Connect';
  }
}

async function ensurePuterSignedIn(signal) {
  if (!window.puter) throw new Error('Puter.js did not load. Check your connection and refresh the page.');
  if (!puter.auth.isSignedIn()) {
    await waitFor(puter.auth.signIn({ attempt_temp_user_creation: true }), signal, 120000,
      'Sign-in timed out. Close the Puter sign-in window and try again.');
    await updateAuthUI();
  }
}

function optimisationTaskMessage(cleaned) {
  return `USER REQUEST

${cleaned}

Interpret this naturally in the context of the conversation. Infer what outcome the user wants before searching. If they describe something they already own and ask for an upgrade, benchmark recommendations against that current item and do not simply recommend it back to them. If the request is broad (for example, "dinner out in London"), make sensible assumptions, research a small set of strong current choices, and include the best verified Avios/reward route for booking or paying. If it is an exact product, research the best current UK buying route. Complete the useful research in this turn rather than offering to do it later.`;
}

function buildMessages(cleaned, profile) {
  const history = conversation.slice(-MAX_HISTORY_TURNS);
  return [
    { role: 'system', content: systemPrompt(profile) },
    ...history,
    { role: 'user', content: optimisationTaskMessage(cleaned) }
  ];
}

async function runShoppingResearch(messages, signal) {
  // One paid request per submission. Never silently spend more allowance on a retry.
  const response = await waitFor(puter.ai.chat(messages, {
    model: MODEL,
    temperature: 0.1,
    max_tokens: 2600,
    signal
  }), signal, 120000,
  'The search timed out. Puter may still finish it and use allowance. Check your connection before retrying, or use “Use your AI”.');
  return getResponseText(response);
}

async function sendMessage(message) {
  const cleaned = message.trim();
  if (!cleaned || busy) return;

  suggestions.hidden = true;
  const profileSnapshot = getProfile();
  const requestMessages = buildMessages(cleaned, profileSnapshot);
  const operation = new AbortController();
  activeOperation = operation;
  addMessage('user', cleaned);
  input.value = '';
  autoGrow();
  setBusy(true);

  const typing = addTyping();

  try {
    await ensurePuterSignedIn(operation.signal);
    operation.signal.throwIfAborted();
    typing.querySelector('.research-status').textContent = 'Researching…';

    const answer = await runShoppingResearch(requestMessages, operation.signal);
    if (activeOperation !== operation) return;
    if (!answer) throw new Error('The AI returned an empty response.');

    typing.remove();
    addMessage('assistant', answer, profileSnapshot);
    conversation.push({ role: 'user', content: cleaned });
    conversation.push({ role: 'assistant', content: answer });
    conversation = conversation.slice(-MAX_HISTORY_TURNS);
  } catch (error) {
    if (activeOperation !== operation) return;
    // The SDK supports AbortSignal; stop its transport on a local timeout too.
    operation.abort();
    typing.remove();
    addMessage('assistant', friendlyPuterError(error), profileSnapshot);
    if (!input.value) {
      input.value = cleaned;
      autoGrow();
    }
  } finally {
    if (activeOperation === operation) {
      activeOperation = null;
      setBusy(false);
      // Avoid stealing focus if the user is reading or using another control.
      if (document.activeElement === document.body || document.activeElement === sendButton) input.focus();
    }
  }
}

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  handleQuery(input.value);
});

input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    form.requestSubmit();
  }
});

suggestions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-prompt]');
  if (!button || !suggestions.contains(button)) return;
  handleQuery(button.dataset.prompt);
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

providerButtons.forEach((button) => {
  button.addEventListener('click', () => setProvider(button.dataset.provider));
});

clearChatButton.addEventListener('click', () => {
  const wasSearching = busy && currentMode === 'puter';
  activeOperation?.abort();
  activeOperation = null;
  setBusy(false);
  conversation = [];
  messagesEl.innerHTML = '';
  suggestions.hidden = false;
  promptRecovery.hidden = true;
  generatedPrompt.value = '';
  lastExternalRequest = '';
  handoffStatus.textContent = '';
  input.value = '';
  autoGrow();
  input.focus();
  if (wasSearching) showToast('Chat cleared. A search already sent to Puter may still use your allowance.');
});

copyPromptButton.addEventListener('click', async () => {
  if (busy || !generatedPrompt.value) return;
  const operation = new AbortController();
  activeOperation = operation;
  setBusy(true);
  try {
    const copied = await copyText(generatedPrompt.value, operation.signal);
    if (activeOperation !== operation) return;
    handoffStatus.textContent = copied ? 'Prompt copied. Paste it into your assistant and send it there.'
      : 'Select the prompt above and copy it manually, then paste it into your assistant.';
    if (!copied) {
      generatedPrompt.focus();
      generatedPrompt.select();
    }
  } catch (_) {
    // New chat discards this local clipboard operation.
  } finally {
    if (activeOperation === operation) {
      activeOperation = null;
      setBusy(false);
    }
  }
});

authButton.addEventListener('click', async () => {
  if (busy || !window.puter || puter.auth.isSignedIn()) return;
  try {
    await puter.auth.signIn({ attempt_temp_user_creation: true });
    await updateAuthUI();
  } catch (error) {
    addMessage('assistant', friendlyPuterError(error));
  }
});

populateExamplePrompts();
loadProfile();
loadAiPreferences();
updateProfileSummary();
autoGrow();
updateAuthUI();

const puterSdk = document.getElementById('puter-sdk');
puterSdk.addEventListener('load', () => {
  sdkStatus.hidden = currentMode !== 'puter' || Boolean(window.puter);
  updateAuthUI();
});
puterSdk.addEventListener('error', () => {
  sdkStatus.textContent = 'Puter could not load. Check your connection and refresh, or switch to “Use your AI”.';
});
setTimeout(() => {
  if (!window.puter) sdkStatus.textContent = 'Puter has not loaded. Check your connection and refresh, or switch to “Use your AI”.';
}, 15000);
