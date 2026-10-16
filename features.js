/* Optional local tools. No accounts, background research or automatic saving. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('tools-dialog');
  const SAVED_KEY = 'aviosmaxxing-saved-v1';
  const LIMIT = 30;
  const BYTE_LIMIT = 1000000;
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  let items = [];
  let favouritesOnly = false;
  let latestQuestion = '';
  let operationBusy = false;
  let volatileSaved = false;
  let loadNotice = '';
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const button = (text, action) => {
    const el = node('button', text, 'tool-button');
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  };
  const status = text => {
    $('tools-status').textContent = text;
    if (text && dialog.open) $('tools-status').scrollIntoView({ block: 'nearest' });
  };
  const safeURL = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  };
  const sourceLink = (label, url) => {
    const a = node('a', label, 'tool-link');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  };
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value && value <= today();
  const format = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value);
  const precise = value => new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 12 }).format(value);
  const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);

  function activateTab(id, focus = false) {
    tabs.forEach(tab => {
      const active = tab.id === `tab-${id}`;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !active;
      if (active && focus) tab.focus();
    });
  }
  function openTools(tab = 'guide') {
    status(volatileSaved ? 'Kept for this visit only. Export a copy to keep it.' : loadNotice);
    if (!$('saved-question').value) $('saved-question').value = input.value.trim() || lastExternalRequest || latestQuestion;
    activateTab(tab);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  $('open-tools').addEventListener('click', () => openTools());
  $('close-tools').addEventListener('click', () => dialog.close());
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab.id.replace('tab-', '')));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); activateTab(tabs[next].id.replace('tab-', ''), true);
    });
  });

  // A standard Markdown table works in other assistants too. Only this exact
  // labelled shape becomes cards; arbitrary Markdown retains the safe renderer.
  const comparisonInstructions = `
When comparing purchase or booking routes, include a Markdown table with these exact columns:
| Route | Cash price | Avios | Fees | Eligibility / exclusions | Checked | Sources |
| --- | --- | --- | --- | --- | --- | --- |
Use 2–4 rows when useful. State currency; Cash price excludes separately stated mandatory Fees. Distinguish the recommended route, lowest total cost and most Avios in the Route text when supported. Avios must distinguish direct Avios from convertible points. Include only earnings verified against current primary sources for the selected rewards; never add unverified earnings to totals. Use “Unverified” for any price, fee, reward amount or rule you could not verify, not an invented number or zero. Checked is the actual YYYY-MM-DD date you checked those sources, or “Unverified”. Sources contains direct Markdown links supporting prices AND rewards. Do not put vertical bars inside cells. A table is unnecessary for non-comparison follow-ups. Explain any extra cost per extra Avios and show your arithmetic below the table. These are AI-reported checks, not a guarantee by the app.
`;
  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
  }
  function renderAnswer(container, text) {
    const lines = String(text).split('\n');
    let start = -1, rows = [], end = -1;
    const expected = ['route', 'cash', 'avios', 'fees', 'eligibility', 'checked', 'sources'];
    const aliases = {
      route: 'route', option: 'route', optionroute: 'route',
      cashprice: 'cash', cashpricegbp: 'cash', cashcost: 'cash', price: 'cash', pricegbp: 'cash',
      avios: 'avios', totalavios: 'avios', aviosestimate: 'avios',
      fees: 'fees', extrafees: 'fees', additionalfees: 'fees',
      eligibility: 'eligibility', eligibilityexclusions: 'eligibility',
      checked: 'checked', lastchecked: 'checked', datechecked: 'checked',
      sources: 'sources', source: 'sources', sourcelinks: 'sources'
    };
    for (let i = 0; i < lines.length - 2; i += 1) {
      const headings = cells(lines[i]).map(s => aliases[s.toLowerCase().replace(/[^a-z]/g, '')]);
      if (headings.length !== 7 || new Set(headings).size !== 7 || !expected.every(s => headings.includes(s))) continue;
      const order = expected.map(s => headings.indexOf(s));
      const separators = cells(lines[i + 1]);
      if (separators.length !== 7 || !separators.every(s => /^:?-{3,}:?$/.test(s))) continue;
      const found = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|')) {
        const row = cells(lines[j]);
        if (row.length !== 7 || row.some(s => s.length > 4000)) break;
        found.push(order.map(n => row[n])); j += 1;
      }
      if (found.length && found.length <= 4) { start = i; end = j; rows = found; break; }
    }
    container.replaceChildren();
    if (start !== -1) {
      const section = node('section', undefined, 'comparison');
      section.setAttribute('aria-label', 'Rewards route comparison');
      section.appendChild(node('p', 'AI-reported prices and rewards. Open the sources and check the final terms before paying.', 'comparison-notice'));
      const grid = node('div', undefined, 'comparison-grid');
      rows.forEach(row => {
        const card = node('article', undefined, 'comparison-card');
        // Titles are plain text; every other cell uses the existing escaped,
        // protocol-restricted Markdown renderer, never model-supplied HTML.
        card.appendChild(node('h4', row[0].replace(/\*\*/g, '')));
        const dl = node('dl');
        ['Cash price', 'Avios', 'Fees', 'Eligibility / exclusions', 'Source check reported', 'Sources'].forEach((label, n) => {
          dl.appendChild(node('dt', label));
          const dd = node('dd');
          const value = n === 4 && !validDate(row[n + 1]) ? 'Unverified' : row[n + 1] || 'Unverified';
          dd.innerHTML = renderAssistantText(value);
          dl.appendChild(dd);
        });
        card.appendChild(dl); grid.appendChild(card);
      });
      section.appendChild(grid); container.appendChild(section);
      lines.splice(start, end - start);
    }
    const narrative = node('div', undefined, 'answer-narrative');
    narrative.innerHTML = renderAssistantText(lines.join('\n'));
    container.appendChild(narrative);
  }

  function cleanProfile(value) {
    const profile = Object.fromEntries(profileInputs.map(el => [el.dataset.profile, value?.[el.dataset.profile] === true]));
    const plans = [...revolutPlan.options].map(o => o.value);
    profile.revolutPlan = plans.includes(value?.revolutPlan) ? value.revolutPlan : 'Standard';
    if (profile.baAmex && profile.baPremium) throw new Error('Conflicting BA Amex cards in the saved profile.');
    if (profile.barclaycardAvios && profile.barclaycardPlus) throw new Error('Conflicting Barclaycard cards in the saved profile.');
    return profile;
  }
  function cleanItem(value) {
    if (!value || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)
      || typeof value.question !== 'string' || !value.question.trim() || value.question.length > 12000
      || typeof value.answer !== 'string' || value.answer.length > 30000
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
      throw new Error('A saved item is invalid or too long.');
    }
    return { id: value.id, question: value.question.trim(), answer: value.answer,
      profile: cleanProfile(value.profile), createdAt: new Date(value.createdAt).toISOString(), favourite: value.favourite === true };
  }
  function decodeSaved(text) {
    if (new TextEncoder().encode(text).length > BYTE_LIMIT) throw new Error('The file is larger than 1 MB.');
    const data = JSON.parse(text);
    if (data?.version !== 1 || !Array.isArray(data.items) || data.items.length > LIMIT) throw new Error('Use an Aviosmaxxing export with up to 30 items.');
    const result = data.items.map(cleanItem);
    if (new Set(result.map(i => i.id)).size !== result.length) throw new Error('Duplicate item IDs in the file.');
    return result;
  }
  function persist() {
    let saved = true;
    try {
      const data = JSON.stringify({ version: 1, items });
      if (new TextEncoder().encode(data).length > BYTE_LIMIT) throw new Error('Storage limit');
      localStorage.setItem(SAVED_KEY, data);
      volatileSaved = false; loadNotice = '';
      status('Saved on this browser.');
    } catch (_) {
      saved = false;
      volatileSaved = true;
      status('Kept for this visit only. Your browser could not save it; export a copy to keep it.');
    }
    renderSaved();
    return saved;
  }
  function saveItem(question, answer = '', profile = getProfile()) {
    try {
      const record = cleanItem({ id: crypto.randomUUID(), question, answer, profile, createdAt: new Date().toISOString(), favourite: false });
      if (items.some(i => i.question === record.question && i.answer === record.answer && JSON.stringify(i.profile) === JSON.stringify(record.profile))) {
        status('Already in your saved items.'); showToast('Already in your saved items.'); return;
      }
      if (items.length >= LIMIT) throw new Error('You have 30 saved items. Export or delete some before saving another.');
      if (new Blob([JSON.stringify({ version: 1, items: [record, ...items] })]).size > BYTE_LIMIT) throw new Error('Saved items are full. Export or delete some before saving another.');
      items.unshift(record);
      const saved = persist();
      showToast(saved ? 'Saved. Find it under Tools → Saved.' : 'Saved for this visit only. Export a copy from Tools → Saved.', saved ? 'default' : 'error');
    } catch (error) { status(error.message); showToast(error.message, 'error'); }
  }
  function prepareQuestion(question) {
    if (operationBusy) { status('Wait for the current search, or use New chat to stop waiting.'); return; }
    input.value = question;
    autoGrow();
    dialog.close();
    input.focus();
  }
  function renderSaved() {
    $('saved-count').textContent = items.length;
    const list = $('saved-items'); list.replaceChildren();
    const shown = items.filter(i => !favouritesOnly || i.favourite);
    if (!shown.length) list.appendChild(node('p', favouritesOnly ? 'No favourites yet. Star a saved item to keep it handy.' : 'Nothing saved yet. Save an answer, a search or a calculator estimate.', 'tool-copy'));
    shown.forEach(item => {
      const firstLine = item.question.split('\n')[0];
      const title = firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine;
      const article = node('article', undefined, 'saved-item');
      const details = node('details');
      const summary = node('summary', title);
      details.appendChild(summary);
      details.appendChild(node('p', item.question, 'saved-query'));
      const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt));
      details.appendChild(node('p', `Saved ${date}. This is a snapshot; prices, offers and your eligibility may have changed.`, 'tool-copy'));
      details.appendChild(node('p', `Saved rewards: ${profileLabels(item.profile).join(' · ') || 'None selected'}. Research again uses your current selections.`, 'tool-copy'));
      if (item.answer) {
        const answer = node('div', undefined, 'saved-answer');
        // Render lazily so a full archive does not create hundreds of cards on load.
        let rendered = false;
        details.addEventListener('toggle', () => {
          if (details.open && !rendered) { renderAnswer(answer, item.answer); rendered = true; }
        });
        details.appendChild(answer);
      } else details.appendChild(node('p', 'Saved search. No answer is stored.', 'tool-copy'));
      article.appendChild(details);
      const actions = node('div', undefined, 'saved-actions');
      const favourite = button(item.favourite ? '★ Favourite' : '☆ Favourite', () => {
        item.favourite = !item.favourite; persist();
        const replacement = [...list.querySelectorAll('[data-favourite]')].find(el => el.dataset.favourite === item.id);
        (replacement || $('saved-favourites')).focus();
      });
      favourite.dataset.favourite = item.id;
      favourite.setAttribute('aria-pressed', String(item.favourite));
      favourite.setAttribute('aria-label', `Favourite: ${title}`);
      const research = button('Research again', () => prepareQuestion(item.question));
      research.dataset.prepare = ''; research.disabled = operationBusy;
      const remove = button('Delete', () => {
        items = items.filter(i => i.id !== item.id); persist(); $('tab-saved').focus();
      });
      remove.setAttribute('aria-label', `Delete: ${title}`);
      actions.append(favourite, research, remove); article.appendChild(actions); list.appendChild(article);
    });
    $('export-saved').disabled = !items.length;
    $('delete-saved').disabled = !items.length;
  }
  function offerSave(row, record) {
    latestQuestion = record.question;
    row.querySelector('.bubble').appendChild(button('Save recommendation', () => saveItem(record.question, record.answer, record.profile)));
  }
  function offerExternalSave() {
    if ($('save-external-search')) return;
    const save = button('Save search', () => saveItem(lastExternalRequest));
    save.id = 'save-external-search';
    promptRecovery.querySelector('.prompt-actions').appendChild(save);
  }
  $('save-form').addEventListener('submit', event => {
    event.preventDefault(); saveItem($('saved-question').value, $('saved-answer').value);
  });
  function filterSaved(value) {
    favouritesOnly = value;
    $('saved-all').setAttribute('aria-pressed', String(!value));
    $('saved-favourites').setAttribute('aria-pressed', String(value));
    renderSaved();
  }
  $('saved-all').addEventListener('click', () => filterSaved(false));
  $('saved-favourites').addEventListener('click', () => filterSaved(true));
  $('delete-saved').addEventListener('click', () => {
    if (window.confirm('Delete all saved items from this browser? Export first if you want to keep a copy.')) { items = []; persist(); $('tab-saved').focus(); }
  });
  $('export-saved').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, items }, null, 2)], { type: 'application/json' }));
    const a = node('a'); a.href = url; a.download = `aviosmaxxing-saved-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Export contains your saved searches, answers and selected rewards. Keep it somewhere private.');
  });
  $('import-saved').addEventListener('click', () => $('saved-file').click());
  $('saved-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > BYTE_LIMIT) throw new Error('Choose a file smaller than 1 MB.');
      const imported = decodeSaved(await file.text());
      const key = i => JSON.stringify([i.question, i.answer, i.profile]);
      const seen = new Set(items.map(key));
      const additions = imported.filter(i => { if (seen.has(key(i))) return false; seen.add(key(i)); return true; })
        .map(i => ({ ...i, id: crypto.randomUUID() }));
      const merged = [...additions, ...items];
      if (merged.length > LIMIT || new Blob([JSON.stringify({ version: 1, items: merged })]).size > BYTE_LIMIT) throw new Error('Import exceeds the saved-item limit. Export or delete some items first.');
      items = merged;
      if (persist()) status(`Imported ${additions.length} item${additions.length === 1 ? '' : 's'}. Existing items were kept.`);
    } catch (error) { status(`Import failed: ${error.message}`); }
    finally { event.target.value = ''; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== SAVED_KEY && event.key !== null) return;
    try { items = decodeSaved(event.newValue || '{"version":1,"items":[]}'); renderSaved(); status('Saved items updated in another tab.'); }
    catch (_) { status('Another tab saved invalid data. Your current items are still available.'); }
  });

  const guideDefinitions = {
    purchase: [ ['item', 'Product, category or product link', 'text', true], ['budget', 'Total budget (£, optional)', 'number'], ['retailers', 'Preferred retailers (optional)', 'text'] ],
    hotel: [ ['destination', 'Destination', 'text', true], ['start', 'Check-in (optional)', 'date'], ['end', 'Check-out (optional)', 'date'], ['people', 'Guests', 'number', true, 2], ['budget', 'Budget per night (£, optional)', 'number'] ],
    flight: [ ['from', 'Flying from', 'text', true], ['destination', 'Flying to', 'text', true], ['start', 'Departure (optional)', 'date'], ['end', 'Return (optional; blank for one-way)', 'date'], ['people', 'Travellers', 'number', true, 1], ['cabin', 'Cabin', 'select'] ],
    dining: [ ['destination', 'Area or restaurant', 'text', true], ['start', 'Date (optional)', 'date'], ['people', 'People', 'number', true, 2], ['budget', 'Budget per person (£, optional)', 'number'], ['preferences', 'Cuisine or dietary needs (optional)', 'text'] ]
  };
  const guideDrafts = new Map();
  let guideKind = 'purchase';
  function renderGuide() {
    const fields = $('guide-fields'); fields.replaceChildren();
    guideDefinitions[guideKind].forEach(([key, label, type, required = false, value = '']) => {
      const wrapper = node('label', label);
      const control = node(type === 'select' ? 'select' : 'input');
      control.id = `guide-${key}`; control.name = key; control.required = required;
      if (type === 'select') ['Economy', 'Premium economy', 'Business', 'First'].forEach(text => control.appendChild(new Option(text, text)));
      else {
        control.type = type;
        if (type === 'text') control.maxLength = 500;
        if (type === 'number') { control.min = key === 'people' ? '1' : '0.01'; control.max = key === 'people' ? '20' : '1000000'; control.step = key === 'people' ? '1' : '0.01'; control.inputMode = key === 'people' ? 'numeric' : 'decimal'; }
        if (type === 'date') control.min = today();
      }
      control.value = guideDrafts.get(guideKind)?.[key] ?? value;
      wrapper.appendChild(control); fields.appendChild(wrapper);
    });
  }
  $('guide-kind').addEventListener('change', event => {
    guideDrafts.set(guideKind, Object.fromEntries(new FormData($('guide-form'))));
    guideKind = event.target.value; renderGuide();
  });
  $('guide-form').addEventListener('input', () => {
    $('guide-fields').querySelectorAll('input').forEach(el => el.setCustomValidity(''));
    $('guide-end')?.setCustomValidity(''); $('guide-start')?.setCustomValidity('');
  });
  $('guide-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const empty = [...event.target.querySelectorAll('input[required][type="text"]')].find(el => !el.value.trim());
    if (empty) { empty.setCustomValidity('Add a product or location.'); empty.reportValidity(); return; }
    if (data.end && !data.start) { $('guide-start').setCustomValidity('Add the starting date, or clear the ending date.'); $('guide-start').reportValidity(); return; }
    if (data.end && (data.end < data.start || (guideKind === 'hotel' && data.end === data.start))) {
      $('guide-end').setCustomValidity(guideKind === 'hotel' ? 'Check-out must be after check-in.' : 'Return must be on or after departure.'); $('guide-end').reportValidity(); return;
    }
    let lines;
    if (guideKind === 'purchase') lines = [`Find the best UK buying route for: ${data.item.trim()}.`, data.budget && `Total budget: ${money(Number(data.budget))}.`, data.retailers && `Preferred retailers: ${data.retailers.trim()}.`];
    if (guideKind === 'hotel') lines = [`Find a hotel in ${data.destination.trim()}.`, `Guests: ${data.people}.`, data.start ? `Check-in: ${data.start}. Check-out: ${data.end || 'flexible'}.` : 'Dates are flexible.', data.budget && `Budget per night: ${money(Number(data.budget))}.`];
    if (guideKind === 'flight') lines = [`Find flights from ${data.from.trim()} to ${data.destination.trim()}.`, `Travellers: ${data.people}. Cabin: ${data.cabin}.`, data.start ? `Departure: ${data.start}. Return: ${data.end || 'one-way'}.` : 'Dates are flexible; one-way unless I specify a return.'];
    if (guideKind === 'dining') lines = [`Find dining options in or at ${data.destination.trim()}.`, `People: ${data.people}.`, data.start ? `Date: ${data.start}.` : 'Date is flexible.', data.budget && `Budget per person: ${money(Number(data.budget))}.`, data.preferences && `Cuisine / dietary needs: ${data.preferences.trim()}.`];
    const notes = $('guide-notes').value.trim();
    if (notes) lines.push(`Other requirements: ${notes}`);
    lines.push('Use my selected rewards. Compare total cash cost and Avios, with eligibility, exclusions and dated primary sources.');
    prepareQuestion(lines.filter(Boolean).join('\n'));
  });

  // Source links are issuer entry points, not evidence of a fetched rate.
  // No financial rate is prefilled without live verification.
  const cardDefinitions = [
    { key: 'baAmex', label: 'BA Amex', url: 'https://www.americanexpress.com/en-gb/credit-cards/british-airways-credit-card/' },
    { key: 'baPremium', label: 'BA Amex Premium Plus', url: 'https://www.americanexpress.com/en-gb/credit-cards/british-airways-premium-plus-credit-card/' },
    { key: 'barclaycardAvios', label: 'Barclaycard Avios', url: 'https://www.barclaycard.co.uk/personal/credit-cards/avios' },
    { key: 'barclaycardPlus', label: 'Barclaycard Avios Plus', url: 'https://www.barclaycard.co.uk/personal/credit-cards/avios' },
    { key: 'membershipRewards', label: 'Amex Membership Rewards', points: 'Membership Rewards points', url: 'https://www.americanexpress.com/en-gb/rewards/membership-rewards/' },
    { key: 'revolut', label: 'Revolut', points: 'RevPoints', url: 'https://www.revolut.com/rev-points/' },
    { key: 'custom', label: 'Other card / manual rate', url: '' }
  ];
  function selectedCard() { return cardDefinitions.find(c => c.key === $('calc-card').value); }
  function resetCardRate() {
    const card = selectedCard();
    $('calc-rate-label').textContent = `${card.points || 'Avios'} per £1`;
    $('calc-conversion-row').hidden = !card.points;
    $('calc-conversion').required = Boolean(card.points);
    $('calc-conversion').disabled = !card.points;
    $('calc-rate').value = ''; $('calc-conversion').value = '';
    $('calc-confirm').checked = false; $('calc-source').value = card.url;
    $('calc-portal-confirm').checked = false;
    ['calc-source', 'calc-date', 'calc-rate', 'calc-conversion'].forEach(id => $(id).setCustomValidity(''));
    $('calc-issuer').hidden = !card.url;
    if (card.url) $('calc-issuer').href = card.url; else $('calc-issuer').removeAttribute('href');
    $('calc-date').value = today(); $('calc-date').max = today();
    $('calculator-result').hidden = true;
  }
  function profileChanged() {
    const previous = $('calc-card').value;
    const profile = getProfile();
    $('calc-card').replaceChildren();
    cardDefinitions.filter(c => c.key === 'custom' || profile[c.key]).forEach(c => $('calc-card').appendChild(new Option(c.key === 'revolut' ? `Revolut ${profile.revolutPlan}` : c.label, c.key)));
    if (previous !== 'custom' && [...$('calc-card').options].some(o => o.value === previous)) $('calc-card').value = previous;
    resetCardRate();
  }
  $('calc-card').addEventListener('change', resetCardRate);
  $('research-rates').addEventListener('click', () => {
    const card = $('calc-card').selectedOptions[0].textContent;
    prepareQuestion(`Check the current UK earning rate for ${card} on ordinary eligible purchases. Give direct official issuer sources and the date checked, exclusions, caps, rounding and any conversion or minimum-transfer rules needed to calculate Avios. Do not assume an exact Membership Rewards card or an earning rate that I have not specified. Keep direct Avios and programme points separate. If the card or rate cannot be verified, explain what information is needed instead of inventing a number.`);
  });
  $('calc-portal').addEventListener('change', event => {
    $('calc-portal-fields').hidden = !event.target.checked;
    $('calc-portal-fields').disabled = !event.target.checked;
    $('calc-portal-confirm').checked = false;
    if (!$('calc-portal-spend').value) $('calc-portal-spend').value = $('calc-spend').value;
    $('calculator-result').hidden = true;
  });
  $('calculator-form').addEventListener('input', event => {
    event.target.setCustomValidity?.('');
    $('calc-portal-spend').setCustomValidity('');
    $('calculator-result').hidden = true;
    if (['calc-rate', 'calc-conversion', 'calc-source', 'calc-date'].includes(event.target.id)) $('calc-confirm').checked = false;
    if (['calc-portal-rate', 'calc-portal-source', 'calc-portal-spend'].includes(event.target.id)) $('calc-portal-confirm').checked = false;
  });
  $('calculator-form').addEventListener('submit', event => {
    event.preventDefault();
    const invalid = (id, message) => { $(id).setCustomValidity(message); $(id).reportValidity(); };
    if (!safeURL($('calc-source').value)) return invalid('calc-source', 'Use an HTTPS link without a username or password.');
    const checked = $('calc-date').value;
    if (!validDate(checked) || Date.parse(today()) - Date.parse(checked) > 30 * 86400000) return invalid('calc-date', 'Recheck the current terms. Use a confirmation date within the last 30 days.');
    const spend = Number($('calc-spend').value), rate = Number($('calc-rate').value), fees = Number($('calc-fees').value);
    const card = selectedCard();
    const conversion = card.points ? Number($('calc-conversion').value) : 1;
    const portal = $('calc-portal').checked;
    const portalSpend = portal ? Number($('calc-portal-spend').value) : 0;
    const portalRate = portal ? Number($('calc-portal-rate').value) : 0;
    if (portalSpend > spend) return invalid('calc-portal-spend', 'Portal-eligible spend cannot exceed the qualifying spend entered above.');
    if (portal && !safeURL($('calc-portal-source').value)) return invalid('calc-portal-source', 'Use an HTTPS link without a username or password.');
    const points = spend * rate, cardAvios = points * conversion, portalAvios = portalSpend * portalRate;
    if (![spend, rate, fees, conversion, portalSpend, portalRate, cardAvios, portalAvios].every(Number.isFinite)) return status('Enter finite amounts and rates.');
    const result = $('calculator-result'); result.replaceChildren(); result.hidden = false;
    result.appendChild(node('h3', `${format(cardAvios + portalAvios)} estimated Avios${card.points ? ' equivalent' : ''}`));
    const cardText = `${$('calc-card').selectedOptions[0].textContent}: ${money(spend)} × ${precise(rate)} = ${precise(points)} ${card.points || 'Avios'}${card.points ? ` × ${precise(conversion)} Avios per point = ${precise(cardAvios)} Avios equivalent before transfer` : ''}.`;
    const portalText = portal ? `Portal: ${money(portalSpend)} × ${precise(portalRate)} = ${precise(portalAvios)} Avios.` : 'No portal earnings included.';
    const caveat = 'Illustrative estimate before issuer rounding, caps, minimum transfers and exclusions. Fees entered here do not earn points in this estimate. Rates and eligibility are user-confirmed, not independently verified by this app.';
    result.append(node('p', cardText), node('p', portalText), node('p', `Qualifying spend plus entered fees: ${money(spend + fees)} (fees: ${money(fees)}).`), node('p', caveat, 'tool-copy'));
    const source = safeURL($('calc-source').value);
    result.appendChild(sourceLink(`Rate terms — you confirmed ${checked}`, source));
    if (portal) result.appendChild(sourceLink(`Portal terms — you confirmed ${today()}`, safeURL($('calc-portal-source').value)));
    const savedText = `## Rewards estimate: ${format(cardAvios + portalAvios)} Avios${card.points ? ' equivalent' : ''}\n\n${cardText}\n\n${portalText}\n\nQualifying spend plus entered fees: ${money(spend + fees)}.\n\n${caveat}\n\n[Rate terms — user-confirmed ${checked}](${source})${portal ? `\n\n[Portal terms — user-confirmed ${today()}](${safeURL($('calc-portal-source').value)})` : ''}`;
    result.appendChild(button('Save estimate', () => saveItem(`Rewards estimate: ${money(spend)} with ${$('calc-card').selectedOptions[0].textContent}`, savedText)));
  });

  function setBusy(value) {
    operationBusy = value;
    $('prepare-search').disabled = value;
    dialog.querySelectorAll('[data-prepare]').forEach(el => { el.disabled = value; });
  }
  try { items = decodeSaved(localStorage.getItem(SAVED_KEY) || '{"version":1,"items":[]}'); }
  catch (_) { loadNotice = 'Saved items could not be loaded. You can still save for this visit and export a copy.'; status(loadNotice); }
  renderSaved(); renderGuide(); profileChanged();
  window.AviosFeatures = { comparisonInstructions, renderAnswer, offerSave, offerExternalSave, profileChanged, setBusy };
})();
