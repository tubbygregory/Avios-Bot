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
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[extname(file)];
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

async function open(t, { storage, blockedStorage, sdkMode = 'mock', viewport, hasTouch = false, colorScheme, contrast, forcedColors } = {}) {
  const context = await browser.newContext({ viewport, hasTouch, colorScheme, contrast, forcedColors, serviceWorkers: 'block' });
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
async function choose(page, id) {
  if (!await page.locator('#reward-details').evaluate(e => e.open)) await page.locator('.profile-summary').click();
  await page.locator('label').filter({ has: page.locator(id) }).click();
}
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
  for (const asset of ['app.js', 'features.js', 'theme.js', 'styles.css', 'favicon.svg', '.nojekyll']) {
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

test('phone composer is reachable on the first screen and rewards remain usable when expanded', async t => {
  for (const [width, height] of [[320,568],[375,667],[390,844],[430,932]]) {
    const p = await open(t, {viewport:{width,height},hasTouch:true});
    assert.equal(await p.locator('#reward-details').evaluate(e => e.open), false);
    const send = await p.locator('#send-button').boundingBox();
    assert.ok(send.y >= 0 && send.y + send.height <= height + 1, `composer visible at ${width}x${height}`);
    assert.ok(send.height >= 44 && send.width >= 44);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await choose(p, '#ba-premium'); await choose(p, '#revolut');
    await p.locator('#revolut-plan').selectOption('Ultra');
    const cardTarget = await p.locator('label').filter({has:p.locator('#ba-premium')}).boundingBox();
    // Browser quad subtraction can round a 44px box down by a fraction of a pixel.
    assert.ok(cardTarget.height >= 43.99, `card touch target ${cardTarget.height}px at ${width}x${height}`);
    await p.locator('#done-rewards').click();
    assert.equal(await p.locator('#reward-details').evaluate(e => e.open), false);
    assert.match(await p.locator('#profile-overview').textContent(), /Premium Plus.*Ultra/);
    await ask(p, 'A weekend in Edinburgh'); await idle(p);
    const payload = await p.evaluate(() => window.__calls[0].messages[0].content);
    assert.match(payload, /Premium Plus/); assert.match(payload, /Ultra/);
    assert.equal(await p.locator('#chat-intro').isVisible(), false);
    await p.locator('#clear-chat').click();
    assert.equal(await p.locator('#chat-intro').isVisible(), true);
  }
});

test('phone controls remain reachable in landscape and a keyboard-sized viewport', async t => {
  const p = await open(t, {viewport:{width:390,height:844},hasTouch:true});
  for (const [width,height] of [[844,390],[390,430]]) {
    await p.setViewportSize({width,height});
    await p.locator('#chat-input').focus();
    await p.waitForTimeout(100);
    const rect = await p.locator('#send-button').boundingBox();
    assert.ok(rect.y >= 0 && rect.y + rect.height <= height + 1, `send reachable at ${width}x${height}`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.locator('#chat-input').fill('A short question');
    assert.equal(await p.locator('#chat-input').inputValue(), 'A short question');
  }
});

test('small iPhones show the introduction and example questions above the composer', async t => {
  for (const [width,height] of [[320,568],[375,667],[390,664]]) {
    const p = await open(t, {viewport:{width,height},hasTouch:true});
    const intro = await p.locator('.chat-intro h2').boundingBox();
    const example = await p.locator('.suggestions button').first().boundingBox();
    const dock = await p.locator('.composer-dock').boundingBox();
    assert.ok(intro.y >= 0 && intro.y + intro.height <= dock.y, `greeting clear at ${width}x${height}`);
    assert.ok(example.y >= 0 && example.y + example.height <= dock.y, `example clear at ${width}x${height}`);
  }
});

test('phone replies scroll into view and reset restores the compact banner', async t => {
  const p = await open(t, {viewport:{width:390,height:844},hasTouch:true});
  await p.evaluate(() => window.__answer = {message:{content:('## Example answer\n\nCheck the current merchant terms before paying.\n\n').repeat(20)}});
  for (const question of ['A laptop', 'What about collecting points?']) {
    await ask(p, question); await idle(p);
    await p.waitForFunction(() => {
      const row = document.querySelector('.message.assistant:last-child');
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const dock = document.querySelector('.composer-dock').getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return rect.top >= header.bottom && rect.top + 40 < dock.top;
    });
    assert.equal(await p.locator('.hero').isVisible(),false);
    await p.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
    const lastText = await p.locator('.answer-content').last().locator('p').last().boundingBox();
    const dock = await p.locator('.composer-dock').boundingBox();
    assert.ok(lastText.y >= 61 && lastText.y + lastText.height <= dock.y, 'end of answer is clear of the dock');
  }
  await p.locator('#clear-chat').click();
  assert.equal(await p.locator('.hero').isVisible(),true);
  assert.ok((await p.locator('#send-button').boundingBox()).y < 844);
});

test('iOS visual viewport changes keep the composer above the keyboard and preserve zoom', async t => {
  const p = await open(t, {viewport:{width:390,height:844},hasTouch:true});
  await p.locator('#chat-input').focus();
  await p.evaluate(() => {
    for (const [key,value] of Object.entries({height:480,offsetTop:0,scale:1})) {
      Object.defineProperty(window.visualViewport,key,{configurable:true,value});
    }
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  assert.equal(await p.locator('html').evaluate(e=>e.classList.contains('keyboard-open')),true);
  assert.equal(await p.locator('.hero').isVisible(),false);
  assert.equal(await p.locator('.suggestions').isVisible(),false);
  const rect = await p.locator('#send-button').boundingBox();
  assert.ok(rect.y >= 61 && rect.y + rect.height <= 480,'composer above the simulated keyboard');
  await p.evaluate(() => {
    Object.defineProperty(window.visualViewport,'scale',{configurable:true,value:2});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  assert.equal(await p.locator('html').evaluate(e=>e.style.getPropertyValue('--keyboard-inset')),'364px');
  await p.evaluate(() => {
    for (const [key,value] of Object.entries({height:844,scale:1})) {
      Object.defineProperty(window.visualViewport,key,{configurable:true,value});
    }
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  assert.equal(await p.locator('html').evaluate(e=>e.classList.contains('keyboard-open')),false);
  assert.equal(await p.locator('.hero').isVisible(),true);
  assert.equal(await p.locator('.suggestions').isVisible(),true);
});

test('home-screen manifest and icon paths resolve under the Pages project URL', async t => {
  const p = await open(t);
  const url = new URL(await p.locator('link[rel="manifest"]').getAttribute('href'),origin);
  const response = await p.request.get(url.href);
  assert.equal(response.status(),200);
  const manifest = await response.json();
  assert.equal(new URL(manifest.start_url,url).href, origin);
  assert.equal(new URL(manifest.scope,url).href, origin);
  assert.equal(new URL(manifest.id,url).href, origin);
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const image = await p.request.get(new URL(icon.src,url).href);
    assert.equal(image.status(),200);
    const bytes = await image.body();
    assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  const apple = await p.request.get(new URL(await p.locator('link[rel="apple-touch-icon"]').getAttribute('href'),origin).href);
  const bytes = await apple.body();
  assert.equal(bytes.readUInt32BE(16),180);
  assert.equal(bytes.readUInt32BE(20),180);
});

test('phone own-AI handoff and collapsed/expanded controls remain accessible', async t => {
  const p = await open(t, {viewport:{width:390,height:844},hasTouch:true});
  await p.evaluate(axe.source);
  const check = async () => {
    const result = await p.evaluate(() => axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  };
  await check();
  await choose(p, '[data-profile="nectar"]');
  await check();
  await p.locator('#done-rewards').click();
  await p.locator('[data-mode="own"]').click();
  await p.locator('[data-provider="claude"]').click();
  const popupPromise = p.waitForEvent('popup');
  await ask(p, 'A dinner in London');
  const popup = await popupPromise; await popup.waitForURL('https://claude.ai/');
  await idle(p); await popup.close();
  assert.match(await p.locator('#handoff-status').textContent(), /Prompt copied/);
  assert.ok((await p.evaluate(()=>window.__clipboard.at(-1))).includes('Nectar'));
  await check();
  await p.locator('.app-notes summary').click();
  assert.equal(await p.locator('.install-hint').isVisible(), true);
  await check();
});

const comparisonAnswer = `Recommended routes for this example only.

| Route | Cash price | Avios | Fees | Eligibility / exclusions | Checked | Sources |
| --- | --- | --- | --- | --- | --- | --- |
| Best overall: Example shop | £100 | 150 Avios | £0 | Selected card; eligible spend only | 2026-01-01 | [Merchant terms](https://example.com/price) [Issuer terms](https://example.com/rewards) |
| Alternative <img src=x onerror=alert(1)> | Unverified | Unverified | Unverified | <script>alert(1)</script> | 2999-01-01 | [Unsafe](javascript:alert(1)) |

Check the final offer before buying.`;
async function tools(page, tab = 'guide') {
  if (!await page.locator('#tools-dialog').evaluate(e=>e.open)) await page.locator('#open-tools').click();
  await page.locator('#tab-' + tab).click();
}
async function saveManual(page, question, answer = '') {
  await tools(page, 'saved');
  if (!await page.locator('.save-details').evaluate(e=>e.open)) await page.locator('.save-details > summary').click();
  await page.locator('#saved-question').fill(question); await page.locator('#saved-answer').fill(answer);
  await page.locator('#save-form button').click();
}
async function calculator(page, {spend='100',rate='1.5',fees='0',conversion} = {}) {
  await tools(page,'calculator');
  for (const [id,value] of Object.entries({'calc-spend':spend,'calc-rate':rate,'calc-fees':fees,'calc-source':'https://example.com/issuer-terms'})) await page.locator('#'+id).fill(value);
  if (conversion) await page.locator('#calc-conversion').fill(conversion);
  await page.locator('#calc-confirm').check();
}

test('both AI prompts request sourced comparisons and all rendered cells escape unsafe content', async t => {
  const p = await open(t,{viewport:{width:390,height:844},hasTouch:true});
  await p.evaluate(answer=>window.__answer={message:{content:answer}},comparisonAnswer);
  await ask(p,'Compare laptop buying routes'); await idle(p);
  assert.equal(await p.locator('.comparison-card').count(),2);
  assert.match(await p.locator('.comparison-card').first().textContent(),/£100.*150 Avios.*£0/s);
  assert.match(await p.locator('.comparison-card').last().textContent(),/Unverified/);
  assert.equal(await p.locator('.comparison-card img,.comparison-card script,.comparison-card a[href^="javascript:"]').count(),0);
  assert.match(await p.locator('.comparison-card').last().textContent(),/<script>/);
  assert.equal(await p.locator('.comparison-card').first().locator('a').first().getAttribute('rel'),'noopener noreferrer');
  assert.equal(await p.locator('#saved-count').textContent(),'0','answers are not saved automatically');
  assert.match(await p.evaluate(()=>window.__calls[0].messages[0].content),/\| Route \| Cash price \| Avios \| Fees \|/);
  await p.locator('[data-mode="own"]').click(); await fakePopup(p); await ask(p,'Compare a hotel'); await idle(p);
  assert.match(await p.locator('#generated-prompt').inputValue(),/\| Route \| Cash price \| Avios \| Fees \|/);
  assert.equal(await p.evaluate(()=>window.__calls.length),1);
});

test('malformed comparison tables retain readable safe answers', async t => {
  const p=await open(t);
  await p.evaluate(answer=>window.__answer={message:{content:answer}},comparisonAnswer.replace('| Fees |','| Missing header |'));
  await ask(p); await idle(p);
  assert.equal(await p.locator('.comparison-card').count(),0);
  assert.match(await p.locator('.answer-content').textContent(),/Recommended routes/);
  assert.equal(await p.locator('.answer-content img,.answer-content script').count(),0);
});

test('all four guides prepare editable details and use selected rewards only on send', async t => {
  const p=await open(t); await choose(p,'#ba-premium'); await choose(p,'[data-profile="nectar"]');
  const dates=await p.evaluate(()=>[10,12].map(n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}));
  for(const kind of ['purchase','hotel','flight','dining']) {
    await tools(p);await p.locator('#guide-kind').selectOption(kind);
    if(kind==='purchase') {await p.locator('#guide-item').fill('https://example.com/laptop');await p.locator('#guide-retailers').fill('Example shop');}
    else await p.locator('#guide-destination').fill(kind==='dining'?'Soho':'Edinburgh');
    if(kind==='flight'){await p.locator('#guide-from').fill('London');await p.locator('#guide-cabin').selectOption('Business');}
    if(kind!=='purchase')await p.locator('#guide-start').fill(dates[0]);
    if(kind==='flight'||kind==='hotel')await p.locator('#guide-end').fill(dates[1]);
    if(kind!=='flight')await p.locator('#guide-budget').fill('250');
    await p.locator('#guide-notes').fill('Step-free access is important.');await p.locator('#prepare-search').click();
    assert.equal(await p.locator('#tools-dialog').evaluate(e=>e.open),false);
    const query=await p.locator('#chat-input').inputValue();assert.match(query,/Step-free access/);assert.match(query,/dated primary sources/);
    if(kind==='flight')assert.match(query,/London.*Edinburgh[\s\S]*Business/);
    if(kind==='purchase')assert.match(query,/https:\/\/example.com\/laptop/);
  }
  assert.equal(await p.evaluate(()=>window.__calls.length),0,'preparing cannot consume AI allowance');
  await p.locator('#send-button').click();await idle(p);
  assert.match(await p.evaluate(()=>window.__calls[0].messages[0].content),/Premium Plus.*Nectar/s);
});

test('guided dates and whitespace are validated and edits retain the draft', async t => {
  const p=await open(t);await tools(p);await p.locator('#guide-item').fill('   ');await p.locator('#prepare-search').click();
  assert.equal(await p.locator('#tools-dialog').evaluate(e=>e.open),true);
  await p.locator('#guide-item').fill('A laptop');await p.locator('#guide-kind').selectOption('hotel');await p.locator('#guide-destination').fill('York');
  const date=await p.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+20);return d.toISOString().slice(0,10)});
  await p.locator('#guide-start').fill(date);await p.locator('#guide-end').fill(date);await p.locator('#prepare-search').click();
  assert.equal(await p.locator('#guide-end').evaluate(e=>e.validity.valid),false);
  await p.locator('#guide-end').fill('');await p.locator('#prepare-search').click();assert.equal(await p.locator('#tools-dialog').evaluate(e=>e.open),false);
  await tools(p);await p.locator('#guide-kind').selectOption('purchase');assert.equal(await p.locator('#guide-item').inputValue(),'A laptop');
});

test('saved recommendations persist, favourite, show snapshots and prepare a fresh search', async t => {
  const p=await open(t);await choose(p,'#ba-amex');await p.evaluate(answer=>window.__answer={message:{content:answer}},comparisonAnswer);
  await ask(p,'Compare shops');await idle(p);await p.getByRole('button',{name:'Save recommendation',exact:true}).click();
  await p.reload();await p.waitForFunction(()=>Boolean(window.AviosFeatures));await tools(p,'saved');assert.equal(await p.locator('#saved-count').textContent(),'1');
  await p.locator('.saved-item summary').click();await p.locator('.saved-item .comparison-card').first().waitFor();
  assert.match(await p.locator('.saved-item').textContent(),/snapshot.*changed/s);assert.match(await p.locator('.saved-item').textContent(),/BA Amex/);
  await p.locator('.saved-item [data-favourite]').click();await p.locator('#saved-favourites').click();assert.equal(await p.locator('.saved-item').count(),1);
  await p.getByRole('button',{name:'Research again',exact:true}).click();assert.equal(await p.locator('#chat-input').inputValue(),'Compare shops');
  assert.equal(await p.evaluate(()=>window.__calls.length),0,'reopening does not send research');assert.equal(await p.locator('#ba-amex').isChecked(),true);
  await tools(p,'saved');await p.getByRole('button',{name:'Delete: Compare shops',exact:true}).click();assert.equal(await p.locator('#saved-count').textContent(),'0');
});

test('own-AI searches and pasted comparisons can be saved without reading a provider account', async t => {
  const p=await open(t);await p.locator('[data-mode="own"]').click();await fakePopup(p);await ask(p,'A dinner in Soho');await idle(p);
  await p.locator('#save-external-search').click();await saveManual(p,'A pasted comparison',comparisonAnswer);
  assert.equal(await p.locator('#saved-count').textContent(),'2');await p.locator('.saved-item summary').filter({hasText:'A pasted comparison'}).click();
  await p.locator('.saved-answer .comparison-card').first().waitFor();assert.equal(await p.locator('.saved-answer .comparison-card').count(),2);
  assert.equal(await p.evaluate(()=>window.__calls.length),0);
});

test('exports round-trip, imports merge, and invalid files leave saved items intact', async t => {
  const p=await open(t);await saveManual(p,'A saved search');const downloadPromise=p.waitForEvent('download');await p.locator('#export-saved').click();
  const download=await downloadPromise;const bytes=readFileSync(await download.path());const data=JSON.parse(bytes);
  assert.equal(data.version,1);assert.equal(data.items.length,1);assert.equal(data.items[0].question,'A saved search');
  assert.deepEqual(Object.keys(data.items[0]).sort(),['answer','createdAt','favourite','id','profile','question']);
  const imported={...data.items[0],id:'new-id',question:'Imported <img src=x onerror=alert(1)>',answer:comparisonAnswer};
  await p.locator('#saved-file').setInputFiles({name:'archive.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,items:[imported]}))});
  await p.waitForFunction(()=>document.getElementById('saved-count').textContent==='2');assert.equal(await p.locator('#saved-items img').count(),0);
  await p.locator('#saved-file').setInputFiles({name:'same.json',mimeType:'application/json',buffer:bytes});await p.waitForFunction(()=>document.getElementById('tools-status').textContent.includes('Imported 0'));
  for(const buffer of [Buffer.from('{bad json'),Buffer.from(JSON.stringify({version:1,items:[{...imported,profile:{baAmex:true,baPremium:true}}]})),Buffer.alloc(1000001,32)]) {
    await p.locator('#saved-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer});await p.waitForFunction(()=>document.getElementById('tools-status').textContent.startsWith('Import failed'));
    assert.equal(await p.locator('#saved-count').textContent(),'2');
  }
});

test('blocked storage keeps explicit saves for this visit and explains export recovery', async t => {
  const p=await open(t,{blockedStorage:true});await saveManual(p,'Keep this locally');assert.equal(await p.locator('#saved-count').textContent(),'1');
  assert.match(await p.locator('#tools-status').textContent(),/visit only.*export/s);
  await p.locator('#close-tools').click();await p.reload();await p.waitForFunction(()=>Boolean(window.AviosFeatures));await tools(p,'saved');
  assert.equal(await p.locator('#saved-count').textContent(),'0');
});

test('calculator separates card, conversion, portal and fees using user-confirmed rates', async t => {
  const p=await open(t);await choose(p,'#ba-premium');await calculator(p,{spend:'100.01',rate:'1.5',fees:'5'});
  assert.equal(await p.locator('#calc-card').inputValue(),'baPremium');await p.locator('#calc-portal').check();
  await p.locator('#calc-portal-spend').fill('80');await p.locator('#calc-portal-rate').fill('2');await p.locator('#calc-portal-source').fill('https://example.com/portal');await p.locator('#calc-portal-confirm').check();
  await p.locator('#calculator-form button[type="submit"]').click();assert.match(await p.locator('#calculator-result h3').textContent(),/310\.02 estimated Avios/);
  assert.match(await p.locator('#calculator-result').textContent(),/£105\.01.*fees: £5\.00/s);assert.match(await p.locator('#calculator-result').textContent(),/user-confirmed, not independently verified/);
  await p.getByRole('button',{name:'Save estimate',exact:true}).click();assert.equal(await p.locator('#saved-count').textContent(),'1');
  await p.locator('#close-tools').click();await choose(p,'#revolut');await p.locator('#revolut-plan').selectOption('Ultra');await tools(p,'calculator');
  await p.locator('#calc-card').selectOption('revolut');assert.equal(await p.locator('#calc-rate').inputValue(),'');
  await calculator(p,{spend:'100',rate:'0.2',conversion:'0.5'});await p.locator('#calc-portal').uncheck();await p.locator('#calculator-form button[type="submit"]').click();
  assert.match(await p.locator('#calculator-result h3').textContent(),/^10 estimated Avios/);assert.match(await p.locator('#calculator-result').textContent(),/Revolut Ultra.*20 RevPoints.*10 Avios/s);
});

test('calculator rejects stale and unsafe terms, validates stacking spend and clears old estimates', async t => {
  const p=await open(t);await calculator(p);await p.locator('#calc-source').fill('http://example.com/terms');await p.locator('#calc-confirm').check();
  await p.locator('#calculator-form button[type="submit"]').click();assert.equal(await p.locator('#calc-source').evaluate(e=>e.validity.valid),false);
  await p.locator('#calc-source').fill('https://example.com/terms');await p.locator('#calc-date').fill('2000-01-01');await p.locator('#calc-confirm').check();
  await p.locator('#calculator-form button[type="submit"]').click();assert.equal(await p.locator('#calc-date').evaluate(e=>e.validity.valid),false);
  await p.locator('#calc-date').fill(await p.locator('#calc-date').getAttribute('max'));await p.locator('#calc-confirm').check();await p.locator('#calc-portal').check();
  await p.locator('#calc-portal-spend').fill('101');await p.locator('#calc-portal-rate').fill('1');await p.locator('#calc-portal-source').fill('https://example.com/portal');await p.locator('#calc-portal-confirm').check();
  await p.locator('#calculator-form button[type="submit"]').click();assert.equal(await p.locator('#calc-portal-spend').evaluate(e=>e.validity.valid),false);
  await p.locator('#calc-portal-spend').fill('100');await p.locator('#calc-portal-confirm').check();await p.locator('#calculator-form button[type="submit"]').click();
  assert.equal(await p.locator('#calculator-result').isVisible(),true);await p.locator('#calc-rate').fill('2');assert.equal(await p.locator('#calculator-result').isVisible(),false);assert.equal(await p.locator('#calc-confirm').isChecked(),false);
});

test('tools trap focus, support arrow-key tabs, pass accessibility checks and fit a small phone', async t => {
  const p=await open(t,{viewport:{width:320,height:568},hasTouch:true});await tools(p);await p.locator('#tab-guide').focus();await p.keyboard.press('ArrowRight');
  assert.equal(await p.locator('#tab-calculator').getAttribute('aria-selected'),'true');await p.keyboard.press('End');assert.equal(await p.locator('#tab-saved').getAttribute('aria-selected'),'true');
  await p.evaluate(axe.source);
  for(const tab of ['guide','calculator','saved']) {
    await p.locator('#tab-'+tab).click();const result=await p.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);assert.ok(await p.locator('#tools-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
    const rect=await p.locator('#close-tools').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=568);
  }
  await p.keyboard.press('Escape');assert.equal(await p.locator('#tools-dialog').evaluate(e=>e.open),false);assert.equal(await p.locator('#open-tools').evaluate(e=>e===document.activeElement),true);
});

test('rate checks prepare a personalised draft and tools cannot replace a pending search', async t => {
  const p=await open(t);await choose(p,'#revolut');await p.locator('#revolut-plan').selectOption('Metal');
  await tools(p,'calculator');await p.locator('#research-rates').click();
  assert.match(await p.locator('#chat-input').inputValue(),/Revolut Metal.*official issuer sources/s);
  assert.equal(await p.evaluate(()=>window.__calls.length),0);
  await p.evaluate(()=>window.__pending=true);await p.locator('#send-button').click();await p.waitForFunction(()=>Boolean(window.__resolveChat));
  await tools(p,'guide');assert.equal(await p.locator('#prepare-search').isDisabled(),true);
  await p.locator('#tab-calculator').click();assert.equal(await p.locator('#research-rates').isDisabled(),true);
  await p.locator('#close-tools').click();await p.locator('#clear-chat').click();
  await tools(p,'guide');assert.equal(await p.locator('#prepare-search').isDisabled(),false);
});

test('saved limits do not evict old items and delete-all requires an explicit confirmation', async t => {
  const profile={};
  const items=Array.from({length:30},(_,n)=>({id:'item-'+n,question:'Saved search '+n,answer:'',createdAt:'2026-01-01T12:00:00Z',profile,favourite:false}));
  const p=await open(t,{storage:{'aviosmaxxing-saved-v1':JSON.stringify({version:1,items})}});
  await saveManual(p,'One too many');assert.equal(await p.locator('#saved-count').textContent(),'30');
  assert.match(await p.locator('#tools-status').textContent(),/30 saved items/);
  p.once('dialog',d=>d.dismiss());await p.locator('#delete-saved').click();assert.equal(await p.locator('#saved-count').textContent(),'30');
  p.once('dialog',d=>d.accept());await p.locator('#delete-saved').click();assert.equal(await p.locator('#saved-count').textContent(),'0');
});

test('small fractional rates keep readable arithmetic and changing cards clears old validation and stacking consent', async t => {
  const p=await open(t);await choose(p,'#ba-amex');await choose(p,'#barclaycard-plus');await calculator(p,{rate:'0.004'});
  await p.locator('#calculator-form button[type="submit"]').click();
  assert.match(await p.locator('#calculator-result').textContent(),/£100\.00 × 0\.004 = 0\.4 Avios/);
  await p.locator('#calc-source').fill('http://example.com/invalid');await p.locator('#calc-confirm').check();await p.locator('#calculator-form button[type="submit"]').click();
  assert.equal(await p.locator('#calc-source').evaluate(e=>e.validity.valid),false);
  await p.locator('#calc-card').selectOption('barclaycardPlus');
  assert.equal(await p.locator('#calc-source').evaluate(e=>e.validity.valid),true);
  assert.equal(await p.locator('#calc-confirm').isChecked(),false);
  assert.equal(await p.locator('#calc-portal-confirm').isChecked(),false);
});

test('selected-card tools fit narrow Safari screens and a keyboard-sized viewport', async t => {
  const p=await open(t,{viewport:{width:320,height:568},hasTouch:true});
  for(const id of ['#ba-premium','#barclaycard-plus','[data-profile="membershipRewards"]','#revolut'])await choose(p,id);
  await p.locator('#done-rewards').click();await tools(p,'calculator');
  for(const key of ['baPremium','barclaycardPlus','membershipRewards','revolut','custom']) {
    await p.locator('#calc-card').selectOption(key);
    assert.ok(await p.locator('#tools-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),key+' has no horizontal overflow');
  }
  await p.setViewportSize({width:390,height:430});await p.locator('#calc-source').focus();
  const dialog=await p.locator('#tools-dialog').boundingBox();assert.ok(dialog.y>=0&&dialog.y+dialog.height<=430);
  const close=await p.locator('#close-tools').boundingBox();assert.ok(close.y>=0&&close.y+close.height<=430);
  await p.locator('#calculator-form button[type="submit"]').scrollIntoViewIfNeeded();
  const heading=await p.locator('.tools-heading').boundingBox();
  assert.ok(heading.y<=dialog.y+2,'sticky heading covers the top edge when scrolled');
  assert.ok(heading.width>=dialog.width-2,'heading background covers the full dialog width');
  await p.locator('#close-tools').click();assert.equal(await p.locator('#tools-dialog').evaluate(e=>e.open),false);
});

const APPEARANCE_KEY='aviosmaxxing-appearance-v1';
async function appearance(page,value) {
  await tools(page);
  await page.locator('#appearance').selectOption(value);
}
async function hasTheme(page,value) {
  await page.waitForFunction(value=>document.documentElement.dataset.theme===value,value);
}

test('appearance defaults to the device, follows live device changes and preserves an explicit choice', async t => {
  const p=await open(t,{colorScheme:'dark',contrast:'no-preference',forcedColors:'none'});
  await hasTheme(p,'dark');assert.equal(await p.locator('html').getAttribute('data-appearance'),'system');
  assert.equal(await p.locator('meta[name="theme-color"]').getAttribute('content'),'#131e30');
  await p.emulateMedia({colorScheme:'light'});await hasTheme(p,'light');
  await p.emulateMedia({contrast:'more'});await hasTheme(p,'contrast');
  assert.equal(await p.evaluate(key=>localStorage.getItem(key),APPEARANCE_KEY),null,'device changes do not replace the preference');
  await appearance(p,'light');await p.emulateMedia({colorScheme:'dark',contrast:'more'});await hasTheme(p,'light');
  assert.equal(await p.locator('html').evaluate(e=>getComputedStyle(e).colorScheme),'light');
  await p.locator('#appearance').selectOption('dark');await p.reload();await hasTheme(p,'dark');
  assert.equal(await p.locator('#appearance').inputValue(),'dark');
  assert.equal(await p.evaluate(key=>localStorage.getItem(key),APPEARANCE_KEY),'dark');
  await appearance(p,'system');await hasTheme(p,'contrast');
  await p.emulateMedia({contrast:'no-preference',colorScheme:'light'});await hasTheme(p,'light');
});

test('invalid appearance storage falls back safely and blocked storage still applies the choice', async t => {
  const invalid=await open(t,{colorScheme:'light',contrast:'no-preference',storage:{[APPEARANCE_KEY]:'<script>dark</script>'}});
  await hasTheme(invalid,'light');assert.equal(await invalid.locator('#appearance').inputValue(),'system');
  const p=await open(t,{colorScheme:'light',contrast:'no-preference',blockedStorage:true});
  await appearance(p,'contrast');await hasTheme(p,'contrast');
  assert.match(await p.locator('#appearance-status').textContent(),/visit.*could not save/);
  await p.locator('#close-tools').click();await p.locator('#clear-chat').click();await hasTheme(p,'contrast');
  await p.reload();await hasTheme(p,'light');assert.equal(await p.locator('#appearance').inputValue(),'system');
});

test('appearance changes sync across tabs and clearing preferences restores device matching', async t => {
  const p=await open(t,{colorScheme:'light',contrast:'no-preference'});
  const other=await p.context().newPage();await other.goto(p.url(),{waitUntil:'domcontentloaded'});
  await appearance(p,'dark');await hasTheme(other,'dark');assert.equal(await other.locator('#appearance').inputValue(),'dark');
  await other.evaluate(()=>localStorage.clear());await hasTheme(p,'light');
  assert.equal(await p.locator('#appearance').inputValue(),'system');
});

test('all palettes keep chat, rewards, handoff, comparisons, saved answers and calculator accessible on phones', async t => {
  for(const theme of ['light','dark','contrast']) {
    const p=await open(t,{viewport:{width:390,height:844},hasTouch:true});
    await appearance(p,theme);await p.locator('#close-tools').click();await p.evaluate(axe.source);
    const check=async state=>{
      const result=await p.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
      assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],theme+' '+state);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),theme+' page fits');
    };
    await check('start');await choose(p,'#ba-premium');await choose(p,'#revolut');await p.locator('#revolut-plan').selectOption('Ultra');
    await check('rewards');await p.locator('#done-rewards').click();
    await p.evaluate(answer=>window.__answer={message:{content:answer}},comparisonAnswer);
    await ask(p,'Compare purchases');await idle(p);await check('comparison');
    await p.getByRole('button',{name:'Save recommendation',exact:true}).click();await tools(p,'saved');
    await p.locator('.saved-item summary').click();await p.locator('.saved-item .comparison-card').first().waitFor();await check('saved');
    await calculator(p);await p.locator('#calculator-form button[type="submit"]').click();await check('calculator');
    assert.equal(await p.locator('#calculator-result').isVisible(),true);
    await p.locator('#close-tools').click();await p.locator('[data-mode="own"]').click();await fakePopup(p);await ask(p,'A hotel');await idle(p);await check('handoff');
    await p.setViewportSize({width:1280,height:900});await check('desktop');
  }
});

test('high contrast keeps strong text, input borders, focus indicators and visible selected states', async t => {
  const p=await open(t,{viewport:{width:320,height:568},hasTouch:true});await appearance(p,'contrast');
  await p.locator('#appearance').focus();
  const contrast=await p.evaluate(()=>{
    const channels=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});
    const luminance=s=>channels(s).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
    const select=getComputedStyle(document.getElementById('appearance'));
    const primary=getComputedStyle(document.getElementById('prepare-search'));
    return {text:ratio(select.color,select.backgroundColor),border:ratio(select.borderTopColor,select.backgroundColor),focus:ratio(select.outlineColor,select.backgroundColor),button:ratio(primary.color,primary.backgroundColor),outlineWidth:select.outlineWidth};
  });
  assert.ok(contrast.text>=7);assert.ok(contrast.button>=7);assert.ok(contrast.border>=3);assert.ok(contrast.focus>=3);assert.equal(contrast.outlineWidth,'3px');
  await p.locator('#close-tools').click();await choose(p,'#ba-amex');
  assert.equal(await p.locator('label').filter({has:p.locator('#ba-amex')}).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
});
