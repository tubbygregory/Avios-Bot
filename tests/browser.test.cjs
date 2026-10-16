const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, firefox, webkit } = require('playwright');
const axe = require('axe-core');

// Exercise project-relative assets, as GitHub Pages does, without remote AI calls.
let browser, server, origin;
before(async () => {
  const root = resolve(__dirname, '..');
  server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const name = pathname.replace(/^\/Avios-Bot\//, '') || 'index.html';
    const file = resolve(root, name);
    if (!pathname.startsWith('/Avios-Bot/') || !file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404).end(); return;
    }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(file)];
    res.writeHead(200, { 'Content-Type': type || 'text/plain' }).end(readFileSync(file));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}/Avios-Bot/`;
  const engine = process.env.TEST_BROWSER || 'chromium';
  assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), 'supported test browser');
  const executablePath = engine === 'chromium' ? process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) : undefined;
  browser = await ({ chromium, firefox, webkit })[engine].launch({ executablePath, args: engine === 'chromium' ? ['--no-sandbox'] : [] });
});
after(async () => { await browser?.close(); await new Promise(done => server?.close(done)); });

const sdk = `
window.__calls = []; window.__authCalls = []; window.__signals = [];
window.__signedIn = true;
window.__answer = {message:{content:'A useful answer with [a source](https://example.com/).'}};
window.puter = {
  auth: {
    isSignedIn: () => window.__signedIn,
    signIn: async options => {
      window.__authCalls.push(options);
      if (window.__authPending) await new Promise(resolve => window.__resolveAuth = resolve);
      if (window.__authError) throw window.__authError;
      window.__signedIn = true;
    }
  },
  ai: {chat: async (messages, options) => {
    const {signal, ...requestOptions} = options;
    window.__signals.push(signal);
    window.__calls.push({messages, options: requestOptions});
    if (window.__pending) return new Promise((resolve,reject) => {window.__resolveChat=resolve;window.__rejectChat=reject;});
    if (window.__rejectNull) throw null;
    if (window.__error) throw window.__error;
    return window.__answer;
  }}
};`;

async function open(t, { storage, blockedStorage, sdkMode = 'mock', viewport } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  t.after(() => context.close());
  // No provider, SDK or AI traffic escapes this deterministic test suite.
  await context.route('https://**/*', route => route.request().url() === 'https://js.puter.com/v2/'
    ? sdkMode === 'pending' ? undefined : sdkMode === 'missing' ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: sdk })
    : route.fulfill({ contentType: 'text/html', body: '<title>Assistant test destination</title>' }));
  await context.addInitScript(({ storage, blockedStorage }) => {
    if (storage) for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    if (blockedStorage) Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new DOMException('Blocked', 'SecurityError'); } });
    window.__clipboard = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => {
      if (window.__clipboardPending) await new Promise(resolve => window.__resolveClipboard = resolve);
      if (window.__clipboardDenied) throw new Error('Denied');
      window.__clipboard.push(text);
    } } });
    document.execCommand = () => Boolean(window.__legacyCopy);
  }, { storage, blockedStorage });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-prompt]').first().waitFor();
  if (sdkMode === 'mock') await page.waitForFunction(() => Boolean(window.puter));
  return page;
}
async function choose(page, id) { await page.locator('label').filter({ has: page.locator(id) }).click(); }
async function ask(page, message = 'A laptop under £1000') {
  await page.locator('#chat-input').fill(message);
  await page.locator('#send-button').click();
}
async function idle(page) { await page.waitForFunction(() => !document.getElementById('send-button').disabled); }
async function fakePopup(page, blocked = false) {
  await page.evaluate(blocked => {
    window.__opened = [];
    window.open = () => blocked ? null : { opener: null, location: { replace: url => window.__opened.push(url) }, close() {} };
  }, blocked);
}

test('project paths, assets and CSP protect the static page', async t => {
  const p = await open(t);
  assert.equal(await p.title(), 'Aviosmaxxing');
  assert.equal(await p.locator('[data-prompt]').count(), 3);
  for (const asset of ['app.js', 'styles.css', 'favicon.svg', '.nojekyll']) {
    assert.equal((await p.request.get(origin + asset)).status(), 200);
  }
  assert.equal(await p.locator('.brand').getAttribute('href'), './');
  await p.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.body.append(script);
    const base = document.createElement('base'); base.href = 'https://evil.invalid/'; document.head.append(base);
  });
  assert.equal(await p.evaluate(() => window.__injected), undefined, 'inline script blocked');
  assert.equal(await p.evaluate(() => document.baseURI), origin, 'base URL cannot be replaced');
});

test('reward exclusivity, all programmes and Revolut plan reach both prompts and persist', async t => {
  const p = await open(t);
  for (const id of ['#ba-amex', '#ba-premium', '#barclaycard-avios', '#barclaycard-plus']) await choose(p, id);
  assert.equal(await p.locator('#ba-amex').isChecked(), false);
  assert.equal(await p.locator('#barclaycard-avios').isChecked(), false);
  for (const key of ['membershipRewards', 'revolut', 'nectar', 'bpme', 'uber', 'heathrowRewards', 'marriottBonvoy', 'ihgOneRewards', 'allAccor']) {
    await choose(p, `[data-profile="${key}"]`);
  }
  await p.locator('#revolut-plan').selectOption('Metal');
  await p.reload();
  await p.waitForFunction(() => Boolean(window.puter));
  assert.equal(await p.locator('#revolut-plan').inputValue(), 'Metal');
  await ask(p, 'Dinner before a show'); await idle(p);
  const system = await p.evaluate(() => window.__calls[0].messages[0].content);
  const labels = ['Premium Plus', 'Barclaycard Avios Plus', 'Membership Rewards', 'Metal', 'Nectar', 'BPme', 'Uber', 'Heathrow Rewards', 'Marriott Bonvoy', 'IHG', 'Accor'];
  for (const label of labels) assert.ok(system.includes(label), label);
  await p.locator('[data-mode="own"]').click(); await fakePopup(p);
  await ask(p, 'A weekend hotel'); await idle(p);
  const prompt = await p.locator('#generated-prompt').inputValue();
  for (const label of labels) assert.ok(prompt.includes(label), label);
  assert.ok(prompt.includes('A weekend hotel') && prompt.includes('Dinner before a show'), 'request and conversation context');
  await choose(p, '#revolut');
  assert.equal(await p.locator('#revolut-plan-row').isVisible(), false);
  assert.equal(await p.evaluate(() => profileDescription(getProfile()).includes('Revolut')), false);
});

test('malformed and conflicting preferences are normalised safely', async t => {
  for (const stored of ['null', '{bad json', JSON.stringify({ baAmex: true, baPremium: true, barclaycardAvios: true, barclaycardPlus: true, nectar: 'false', revolut: true, revolutPlan: 'Unknown' })]) {
    const p = await open(t, { storage: { 'avios-optimiser-profile-v2': stored, 'aviosmaxxing-ai-provider': 'constructor' } });
    assert.equal(await p.locator('#ba-amex').isChecked(), false);
    assert.equal(await p.locator('#ba-premium').isChecked(), false);
    assert.equal(await p.locator('#barclaycard-avios').isChecked(), false);
    assert.equal(await p.locator('#barclaycard-plus').isChecked(), false);
    assert.equal(await p.locator('[data-profile="nectar"]').isChecked(), false);
    assert.equal(await p.locator('#revolut-plan').inputValue(), 'Standard');
    assert.equal(await p.locator('[data-provider="chatgpt"]').getAttribute('aria-pressed'), 'true');
  }
});

test('keyboard users can skip the rewards controls and focus the question', async t => {
  const p = await open(t);
  await p.keyboard.press('Tab');
  assert.equal(await p.locator('.skip-link').evaluate(e => e === document.activeElement), true);
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#chat-input').evaluate(e => e === document.activeElement), true);
  assert.equal(await p.locator('#chat-form').evaluate(e => getComputedStyle(e).outlineStyle), 'solid');
});

test('the page explains why it cannot work when JavaScript is disabled', async t => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  t.after(() => context.close());
  await context.route('https://**/*', route => route.abort());
  const p = await context.newPage();
  await p.goto(origin);
  assert.equal(await p.locator('.no-script').isVisible(), true);
  assert.match(await p.locator('.no-script').textContent(), /needs JavaScript/);
});

test('blocked preference storage still updates controls and personalised prompts', async t => {
  const p = await open(t, { blockedStorage: true });
  await choose(p, '#revolut'); await p.locator('#revolut-plan').selectOption('Ultra');
  assert.equal(await p.locator('#revolut-plan-row').isVisible(), true);
  await ask(p); await idle(p);
  assert.match(await p.evaluate(() => window.__calls[0].messages[0].content), /Ultra/);
});

test('each external provider receives a real isolated popup and a copied personalised prompt', async t => {
  const p = await open(t);
  await p.locator('[data-mode="own"]').click();
  for (const [provider, url] of [['chatgpt', 'https://chatgpt.com/'], ['claude', 'https://claude.ai/'], ['gemini', 'https://gemini.google.com/']]) {
    await p.locator(`[data-provider="${provider}"]`).click();
    const popupPromise = p.waitForEvent('popup');
    await ask(p, `Find a watch using ${provider}`);
    const popup = await popupPromise; await popup.waitForURL(url); await idle(p);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.match(await p.locator('#handoff-status').textContent(), /Prompt copied/);
    assert.ok((await p.evaluate(() => window.__clipboard.at(-1))).includes(`Find a watch using ${provider}`));
    assert.equal(await p.locator('#chat-input').inputValue(), '');
    await popup.close();
  }
  await p.reload();
  assert.equal(await p.locator('#own-ai-panel').isVisible(), true);
  assert.equal(await p.locator('[data-provider="gemini"]').getAttribute('aria-pressed'), 'true');
});

test('denied clipboard and blocked popup retain a selectable prompt and working recovery actions', async t => {
  const p = await open(t); await p.locator('[data-mode="own"]').click();
  await fakePopup(p, true); await p.evaluate(() => window.__clipboardDenied = true);
  await ask(p, 'A watch <img src=x onerror=alert(1)>'); await idle(p);
  assert.match(await p.locator('#handoff-status').textContent(), /Select and copy.*blocked/s);
  assert.equal(await p.locator('#chat-input').inputValue(), 'A watch <img src=x onerror=alert(1)>');
  assert.ok((await p.locator('#generated-prompt').inputValue()).includes('<img src=x'));
  assert.equal(await p.locator('#prompt-recovery img').count(), 0);
  await p.locator('#copy-prompt').click(); await idle(p);
  assert.equal(await p.locator('#generated-prompt').evaluate(e => e.selectionEnd - e.selectionStart), (await p.locator('#generated-prompt').inputValue()).length);
  await p.evaluate(() => window.__clipboardDenied = false);
  await p.locator('#copy-prompt').click(); await idle(p);
  assert.match(await p.locator('#handoff-status').textContent(), /Prompt copied/);
  const popupPromise = p.waitForEvent('popup'); await p.locator('#open-provider').click();
  const popup = await popupPromise; await popup.waitForURL('https://chatgpt.com/');
  assert.equal(await popup.evaluate(() => window.opener), null); await popup.close();
});

test('legacy copy fallback cleans up and duplicate submissions cannot open extra tabs', async t => {
  const p = await open(t); await p.locator('[data-mode="own"]').click(); await fakePopup(p);
  await p.evaluate(() => { window.__clipboardDenied = true; window.__legacyCopy = true; });
  await ask(p); await idle(p);
  assert.match(await p.locator('#handoff-status').textContent(), /Prompt copied/);
  assert.equal(await p.locator('.clipboard-buffer').count(), 0);
  await p.evaluate(() => { window.__clipboardDenied = false; window.__clipboardPending = true; });
  await ask(p, 'Second request');
  await p.evaluate(() => { document.getElementById('chat-form').requestSubmit(); document.getElementById('chat-form').requestSubmit(); });
  assert.equal(await p.evaluate(() => window.__opened.length), 2, 'one tab per user submission');
  await p.locator('#clear-chat').click();
  await p.locator('#chat-input').fill('New request');
  await p.evaluate(() => window.__resolveClipboard());
  assert.equal(await p.locator('#generated-prompt').inputValue(), '');
  assert.equal(await p.locator('#chat-input').inputValue(), 'New request');
  assert.equal(await p.locator('#prompt-recovery').isVisible(), false);
  assert.equal(await p.locator('#toast').isVisible(), false);
});

test('Puter payload, bounded history and safe rendering work without automatic paid retries', async t => {
  const p = await open(t);
  await p.evaluate(() => window.__answer = {message:{content:'I can compare prices.\n<img src=x onerror="window.__xss=1">\n[bad](javascript:alert(1))\n[source](https://example.com/?a="onmouseover="bad)\n**Useful**'}});
  await ask(p, '<svg onload=alert(1)>'); await idle(p);
  assert.equal(await p.locator('#messages img, #messages svg, #messages script').count(), 0);
  assert.equal(await p.evaluate(() => window.__xss), undefined);
  assert.equal(await p.locator('#messages a[href^="javascript:"]').count(), 0);
  assert.equal(await p.locator('#messages a[onmouseover]').count(), 0);
  assert.equal(await p.locator('#messages strong').textContent(), 'Useful');
  assert.equal(await p.evaluate(() => window.__calls.length), 1);
  assert.deepEqual(await p.evaluate(() => window.__calls[0].options), {model:'perplexity/sonar-pro-search',temperature:0.1,max_tokens:2600});
  for (let n = 0; n < 5; n++) { await ask(p, `Follow-up ${n}`); await idle(p); }
  const messages = await p.evaluate(() => window.__calls.at(-1).messages);
  assert.equal(messages.length, 10, 'system, eight history messages, request');
  assert.equal(messages[0].role, 'system');
  assert.ok(messages.at(-1).content.includes('Follow-up 4'));
  assert.equal(messages.some(m => m.content.includes('<svg onload')), false, 'old history trimmed');
});

test('Puter authentication errors, allowance limits, rate limits and invalid results release controls', async t => {
  const p = await open(t);
  for (const [error, expected] of [
    [{error:{code:'insufficient_funds',message:'billing limit'}}, /allowance or billing limit/],
    [{code:'rate_limit',message:'429'}, /limiting requests/],
    [{error:'auth_window_closed'}, /sign-in was cancelled/],
    [{error:'popup_blocked'}, /blocked the Puter sign-in/],
    [{message:'Network unavailable'}, /Network unavailable/]
  ]) {
    await p.evaluate(error => window.__error = error, error);
    await ask(p); await idle(p);
    assert.match(await p.locator('.answer-content').last().textContent(), expected);
    assert.equal(await p.locator('[data-mode="own"]').isEnabled(), true);
  }
  for (const answer of [{message:{content:''}}, {message:{content:[{text:{unexpected:'object'}}]}}, {unexpected:'object'}]) {
    await p.evaluate(answer => { window.__error = null; window.__answer = answer; }, answer);
    await ask(p); await idle(p);
    assert.match(await p.locator('.answer-content').last().textContent(), /empty response/);
  }
  await p.evaluate(() => window.__rejectNull = true);
  await ask(p); await idle(p);
  assert.match(await p.locator('.answer-content').last().textContent(), /could not complete the search/);
  await p.evaluate(() => window.__rejectNull = false);
  await p.evaluate(() => { window.__signedIn=false; window.__authError={error:'auth_window_closed'}; });
  await ask(p); await idle(p);
  assert.equal(await p.evaluate(() => window.__calls.length), 9, 'failed sign-in does not call AI');
  assert.deepEqual(await p.evaluate(() => window.__authCalls[0]), {attempt_temp_user_creation:true});
});

test('clearing chat discards late search and sign-in results without affecting a new request', async t => {
  const p = await open(t);
  await p.evaluate(() => window.__pending = true);
  await ask(p, 'Old request'); await p.waitForFunction(() => Boolean(window.__resolveChat));
  assert.equal(await p.locator('[data-profile="nectar"]').isDisabled(), true);
  await p.locator('#clear-chat').click();
  assert.equal(await p.evaluate(() => window.__signals[0].aborted), true, 'SDK receives cancellation');
  await p.evaluate(() => window.__pending = false);
  await ask(p, 'New request'); await idle(p);
  await p.evaluate(() => window.__resolveChat({message:{content:'STALE RESPONSE'}}));
  assert.equal(await p.getByText('STALE RESPONSE').count(), 0);
  assert.equal(await p.locator('.message.user').count(), 1);
  await p.locator('#clear-chat').click();
  await p.evaluate(() => { window.__signedIn=false; window.__authPending=true; });
  await ask(p); await p.waitForFunction(() => Boolean(window.__resolveAuth));
  await p.locator('#clear-chat').click(); await p.evaluate(() => window.__resolveAuth());
  await p.waitForTimeout(30);
  assert.equal(await p.evaluate(() => window.__calls.length), 2);
  assert.equal(await p.locator('.message').count(), 0);
});

test('stalled AI and clipboard operations have bounded waits and recover', async t => {
  const p = await open(t); await p.clock.install();
  await p.evaluate(() => window.__pending = true);
  await ask(p); await p.waitForFunction(() => Boolean(window.__resolveChat));
  await p.clock.fastForward(120001); await idle(p);
  assert.match(await p.locator('.answer-content').last().textContent(), /timed out.*may still finish/s);
  assert.equal(await p.evaluate(() => window.__signals[0].aborted), true, 'timeout cancels SDK transport');
  await p.evaluate(() => { window.__signedIn=false; window.__authPending=true; });
  await ask(p); await p.waitForFunction(() => Boolean(window.__resolveAuth));
  await p.clock.fastForward(120001); await idle(p);
  assert.match(await p.locator('.answer-content').last().textContent(), /Sign-in timed out/);
  assert.equal(await p.evaluate(() => window.__calls.length), 1, 'timed-out sign-in does not start a search');
  await p.locator('[data-mode="own"]').click(); await fakePopup(p);
  await p.evaluate(() => window.__clipboardPending = true);
  await ask(p); await p.clock.fastForward(4001); await idle(p);
  assert.match(await p.locator('#handoff-status').textContent(), /Select and copy/);
});

test('missing or stalled SDK leaves the independent AI mode usable', async t => {
  for (const sdkMode of ['missing', 'pending']) {
    const p = await open(t, {sdkMode});
    await ask(p); await idle(p);
    assert.match(await p.locator('.answer-content').textContent(), /Puter.js did not load/);
    await p.locator('[data-mode="own"]').click(); await fakePopup(p);
    await ask(p); await idle(p);
    assert.match(await p.locator('#handoff-status').textContent(), /Prompt copied/);
  }
});

test('keyboard checkboxes, composition, Enter and Shift+Enter behave correctly', async t => {
  const p = await open(t);
  await p.locator('#ba-amex').focus(); await p.keyboard.press('Space');
  assert.equal(await p.locator('#ba-amex').isChecked(), true);
  assert.match(await p.locator('label').filter({has:p.locator('#ba-amex')}).evaluate(e => getComputedStyle(e).outlineStyle), /solid/);
  await p.locator('#chat-input').fill('日本語');
  await p.locator('#chat-input').dispatchEvent('keydown', {key:'Enter',isComposing:true});
  assert.equal(await p.evaluate(() => window.__calls.length), 0);
  await p.locator('#chat-input').press('Shift+Enter');
  assert.ok((await p.locator('#chat-input').inputValue()).includes('\n'));
  await p.locator('#chat-input').press('Enter'); await idle(p);
  assert.equal(await p.evaluate(() => window.__calls.length), 1);
  await p.locator('[data-mode="own"]').focus(); await p.keyboard.press('Enter');
  await p.locator('[data-provider="claude"]').focus(); await p.keyboard.press('Space');
  assert.equal(await p.locator('[data-provider="claude"]').getAttribute('aria-pressed'), 'true');
});

test('responsive layouts and WCAG accessibility checks cover both modes and recovery panel', async t => {
  const p = await open(t);
  await p.evaluate(() => window.__answer = {message:{content:'A'.repeat(2000)}});
  await ask(p); await idle(p);
  for (const width of [320, 375, 768, 1280]) {
    await p.setViewportSize({width,height:900});
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`);
  }
  await p.evaluate(axe.source);
  let result = await p.evaluate(() => axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v => ({id:v.id,targets:v.nodes.map(n=>n.target)})), []);
  await p.locator('[data-mode="own"]').click(); await fakePopup(p, true);
  await p.evaluate(() => window.__clipboardDenied=true); await ask(p); await idle(p);
  await p.setViewportSize({width:320,height:900});
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  result = await p.evaluate(() => axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v => ({id:v.id,targets:v.nodes.map(n=>n.target)})), []);
  await p.locator('#clear-chat').click();
  assert.equal(await p.locator('#toast').isVisible(), false, 'new chat clears stale copy status');
  assert.ok(await p.locator('#chat-input').evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'empty composer placeholder fits');
});

test('an SDK-originated abort removes progress, shows an error and restores the question', async t => {
  const p = await open(t);
  await p.evaluate(() => window.__error = {name:'AbortError',message:'The network request was interrupted.'});
  await ask(p, 'Find a laptop'); await idle(p);
  assert.equal(await p.locator('.typing').count(), 0);
  assert.match(await p.locator('.answer-content').textContent(), /interrupted/);
  assert.equal(await p.locator('#chat-input').inputValue(), 'Find a laptop');
});

test('changing rewards refreshes an existing external prompt before copying again', async t => {
  const p = await open(t); await p.locator('[data-mode="own"]').click(); await fakePopup(p);
  await choose(p, '#ba-amex'); await ask(p, 'A weekend away'); await idle(p);
  await choose(p, '#ba-premium');
  let prompt = await p.locator('#generated-prompt').inputValue();
  assert.match(prompt, /Premium Plus/);
  assert.equal(prompt.includes('standard/free BA Amex'), false);
  await choose(p, '#revolut'); await p.locator('#revolut-plan').selectOption('Ultra');
  prompt = await p.locator('#generated-prompt').inputValue();
  assert.match(prompt, /Ultra/);
  assert.match(await p.locator('#handoff-status').textContent(), /updated prompt/);
  await p.locator('#copy-prompt').click(); await idle(p);
  assert.equal(await p.evaluate(() => window.__clipboard.at(-1)), prompt);
});
