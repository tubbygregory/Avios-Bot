# Aviosmaxxing

See [the audit report](AUDIT.md) for findings, validation limits and prioritised improvements.

## Advertising and privacy

The public AdSense publisher ID is `ca-pub-8404673257565926`. The account-verification meta tag and root `ads.txt` identify this publisher. The supplied asynchronous, anonymous-cross-origin advertising script is stored in an inert template; `consent.js` inserts it once Google's certified consent manager confirms a usable state. No manual ad slot, sticky ad, pop-up ad or automatic request retry was added. Keep Auto ads disabled in AdSense to retain manual placement control; actual ad serving and approval are account-side decisions.

In AdSense → Privacy & messaging → European regulations, publish the message for `aviosmaxxing.co.uk` with Consent, Do not consent and Manage options, and enable reopening privacy choices. The owner confirmed this message was published on 18 October 2026. The app bootstraps Google's Funding Choices service for this same publisher and listens to the TCF v2 API. Unknown jurisdiction, CMP errors, incomplete TC strings and missing Google vendor/device-storage consent keep the AdSense loader off. An explicit non-GDPR result may enable it; Google's SDK must still honour all other applicable regional and purpose signals. This minimum gate intentionally also blocks limited ads after a GDPR rejection.

The page footer links to `privacy.html` and a keyboard-accessible Privacy choices dialog. Its Google review button calls `googlefc.showRevocationMessage()` when available. A separate browser-local advertising block overrides Google's permissions, syncs across tabs and does not change reward settings. Blocking or withdrawing consent after the advertising SDK started reloads the page to remove its running code. A failure to save the extra block is explained as visit-only. Google manages its own consent records and cookie deletion; the local block does not erase existing Google cookies.

Google scripts are trusted third-party page code, just like the Puter SDK. The CSP allows the specific Google consent/advertising script hosts without enabling arbitrary inline scripts or eval. The privacy notice describes storage, Google, AI providers, hosting, retention and rights. Operator identity/contact details must be completed before this notice and advertising integration are released.

Tests mock every Google request and cover consent/rejection, missing or stalled CMP, revocation, cross-tab blocking, ad-network failures, phone layouts and automated accessibility in all palettes. The cloud proxy denies Google's official documentation, consent endpoint and ad script; a real browser outside that proxy must still verify that the published message loads without CSP errors, Accept/Reject/Manage work, reopening works and no ad requests happen after rejection. These tests do not establish Google's account approval, actual ad fill or legal compliance.

## Using it on a phone

The phone layout starts with a compact introduction, an expandable rewards summary, search mode and the question composer. Tap **My rewards** to edit cards/programmes, then **Done** to return to the conversation. Selected rewards stay visible in the summary and remain saved between visits. The banner clears when a conversation starts, and new replies scroll beneath the header. Answers use a larger reading size and the composer stays sticky while scrolling. The layout accounts for display safe areas, changing viewport height and landscape phones; the on-screen keyboard clears introductory content to make room for typing, and pinch zoom remains available.

Choose **Tools → Appearance** for **Light**, **Dark**, **High contrast**, or **Match device** (the default). Device matching follows live light/dark changes and uses high contrast when the browser reports increased contrast or forced colours. Explicit choices stay fixed when device preferences change. The selection is stored separately on this browser, syncs across tabs and remains usable for the current visit if storage is blocked. Clearing browser preferences restores device matching.

The appearance script runs before the stylesheet to apply a saved palette on reload. Device preferences are also rechecked when returning to the app, covering browsers that retain stale media-query objects. Native controls and the supported browser toolbar colour follow the selected theme. High contrast uses black, white and yellow, with strong input borders, visible selected states and focus outlines. Operating-system forced colours remain respected. Physical iPhone status-bar behaviour still needs device testing.

To launch it from your home screen, use Safari’s **Share → Add to Home Screen** on iPhone, or your Android browser’s **Install app / Add to Home screen** menu. The manifest and app icons use project-relative URLs for GitHub Pages. Home-screen launch uses standalone display where supported. AI searches still need internet access; no service worker caches pages, conversations, SDK responses or financial advice. Physical-device keyboard and installation behaviour should also be checked on the devices you support.

Imported from https://aviosmaxxing.netlify.app/ on 16 October 2026.

## Planning, comparisons and saved items

Open **Tools** in the header. **Plan a search** has purchase, hotel, flight and dining forms. They prepare an editable question using your details; no AI request is made until you send it. Dates are checked, and switching forms keeps their drafts for the current visit. Both AI modes continue to use your current reward selections.

Both research prompts request a comparison table containing route, cash price, Avios, fees, eligibility/exclusions, date checked and source links. Recognised tables become responsive cards in embedded answers and saved pasted answers. Other answer formats remain readable through the existing safe Markdown renderer. Dates are explicitly AI-reported, future/invalid dates are shown as unverified, and the cards do not claim independent verification of financial information. Open primary sources before paying.

Use **Save recommendation** on an embedded answer or **Save search** beside an external prompt. In **Tools → Saved**, you can also paste an answer from your own assistant, favourite items, delete them, export JSON and import an export on another device. The app cannot read another assistant's account or answers automatically. Saved snapshots include the question, answer, selected rewards and save time. **Research again** prepares the old question with your current reward selections; it does not send a request or restore old eligibility assumptions.

Saving is optional, with a maximum of 30 items and 1 MB per archive. No conversation history is automatically persisted. Imports validate the schema, lengths, reward selections and dates, merge without replacing existing items and reject oversized or invalid files. Blocked browser storage keeps items for the current visit and explains export recovery. **New chat** leaves saved items intact; **Delete all** asks for confirmation. Exports contain personal search and reward information, so keep them private. Saved items do not sync automatically across devices or domains.

**Calculator** estimates card earnings, optional programme-point conversion, and separately confirmed portal earnings. Choose a selected card, enter qualifying spend and rates, link the terms and confirm eligibility. Rate confirmation must be within 30 days; portal rates and stacking require a separate confirmation for today. Programme points remain distinguished from direct Avios, and fees entered separately are excluded from estimated earnings. Issuer rounding, caps, exclusions and transfer minimums still apply. Estimates can be saved explicitly.

There are no preset financial rates: official Amex, Barclaycard and Revolut pages were blocked by the cloud network during implementation, so no unverified defaults were added. Issuer links and **Prepare a rate check** help the visitor verify the exact product and plan through either AI mode. The shortcut prepares a draft, without making a paid request. Calculator results are user-confirmed estimates, not independently verified current offers. No price/bonus alerts or background polling are implemented.

Static HTML, CSS and JavaScript; no build step is required. Serve the repository root with any static web server. Asset paths support GitHub Pages project hosting.

For local development, run `python3 -m http.server 8000` in the checkout. Node dependencies are for tests only; the deployed site needs none.

## Checks

With Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm test
```

On Linux, `npx playwright install --with-deps chromium` can install required browser system libraries too. Tests use `/usr/bin/chromium` when present; set `CHROMIUM_PATH` to choose another executable. Otherwise they use Playwright's installed browser. Set `TEST_BROWSER=firefox` or `TEST_BROWSER=webkit` after installing that browser to run the same suite with another engine. The GitHub workflow tests all three engines on pushes and pull requests.

Browser tests serve the site at `/Avios-Bot/` and cover reward profiles, both prompts, real popup creation for each provider, clipboard/popup recovery, simulated Puter sign-in and response/error/timeout handling, stale results, comparison cards, guided forms, saved-item persistence/import/export, calculator arithmetic and validation, keyboard input, mobile overflow and automated WCAG checks. All external requests are intercepted. Calculator figures in tests are synthetic examples, not claims about current card rates. These tests do **not** validate Puter's live service or submit prompts to an external AI account.

For a live integration check, verify the SDK loads, complete Puter sign-in, and submit one small query using the visitor's allowance. Confirm a sourced response, then try a follow-up. The configured model remains `perplexity/sonar-pro-search`; current account availability can be checked with `puter.ai.listModels()` in Puter's SDK. No alternate model is silently substituted. In “Use your AI”, check the copied prompt and paste/send it in the chosen assistant using your own account. This site cannot read that assistant's response.

## Hosting

To publish on GitHub Pages, open repository Settings → Pages and select Deploy from a branch, main, / (root).

The embedded search uses the external Puter JavaScript SDK and the visitor's Puter allowance. The alternative AI mode copies a prompt and opens the chosen provider.

Puter loads asynchronously so its availability cannot block the rest of the UI. One submission makes at most one AI request; there are no automatic paid retries. Sign-in and search waits time out after two minutes. Clearing a chat or timing out stops waiting and aborts the SDK's search transport through its supported `AbortSignal` option. Work already processed may still use allowance; cancellation does not guarantee a refund. Failed questions return to the composer for an explicit retry.

The generated external prompt remains available in a labelled, selectable text field if clipboard permissions or popup creation fail. A normal link can open the assistant independently. No query or reward profile is put in that link's URL.

Changing rewards refreshes an existing generated prompt and asks you to copy it again. Conflicting saved card variants are cleared with a notice, rather than assuming eligibility for the premium card. Rewards stay in local storage; queries and conversation stay in memory until the page is closed or “New chat” is used, unless explicitly saved. Saved snapshots remain in local storage until deleted through Tools or browser settings. Search submissions share the question, selected rewards and recent conversation with Puter. Copying a prompt makes it available to whichever application you paste it into.

## Security and hosting headers

User messages use text rendering. AI text is escaped before a limited Markdown renderer adds formatting; links allow only HTTP/HTTPS and use `noopener noreferrer`. Generated prompts stay as textarea values. Preferences are validated on load and storage failures do not prevent using them during the current visit.

The page includes a meta Content Security Policy that restricts scripts to this origin, `https://js.puter.com` and the specific Google advertising/consent hosts listed in the HTML. It prohibits embedded objects, base URL replacement and native form submissions, plus a `strict-origin-when-cross-origin` referrer policy. Third-party SDKs remain trusted code with page access, loaded over HTTPS. CSP changes must be checked against real services; test doubles alone cannot prove compatibility.

GitHub Pages does not apply Netlify `_headers` files or provide arbitrary response-header configuration. Policies such as CSP `frame-ancestors`, `X-Frame-Options`, and other response-only headers require a host or fronting proxy that supports them; adding them as HTML meta tags would not work. The import has no original Netlify header configuration, so no claim is made that those original policies have been reproduced. Inspect actual production responses when comparing hosting policies.

Rewards preferences are stored in browser local storage. Preferences saved on the Netlify domain do not automatically transfer to a GitHub Pages domain.

This import contains the publicly deployed frontend. Original undeployed source files, Netlify configuration and deployment history are not included.
