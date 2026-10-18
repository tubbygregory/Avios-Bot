# Aviosmaxxing audit — 16 October 2026

Scope: the static frontend, both personalised prompts, rewards and saved preferences, clipboard/popup handling, SDK integration, cancellation/errors, safe rendering, keyboard/mobile accessibility, dependencies, CI and GitHub Pages hosting. No AGENTS.md applies to this checkout. The Netlify site was inspected read-only and remains unchanged.

## Findings fixed

| Finding | Change | Evidence |
| --- | --- | --- |
| An SDK-originated `AbortError` left the progress row behind | Treat SDK failures as failures unless this app actually discarded the operation; remove progress and restore the question | Regression failed before the fix and passes afterwards |
| Previously generated prompts retained old rewards | Regenerate the displayed prompt after card/programme/plan changes and explicitly request another copy | Regression checks the actual copied prompt after changing BA Amex and Revolut plan |
| Cancellation only stopped local waiting | Forward the documented SDK `AbortSignal` and abort on timeout too; retain the warning that processed work may still consume allowance | Tests inspect the actual signal passed to the SDK on clear/timeout |
| Conflicting saved cards silently favoured premium eligibility | Clear both conflicting variants and explain that the user must select the card they hold | Malformed-storage regression checks both families |
| Failed questions disappeared from the composer | Restore the question for an explicit retry | Interrupted-search regression |
| Progress gave no visible distinction between connecting and researching | Add visible connection/research status | Browser workflow checks |
| Keyboard users had to traverse every reward control | Add a skip link and a strong composer focus indicator | Keyboard regression in the shared browser suite |
| Provider placeholders clipped on small screens; New chat retained old copy notifications | Shorten provider placeholders and clear transient notifications when resetting | Responsive/recovery checks plus live mobile inspection |
| High-contrast selections and JavaScript-disabled operation lacked clear feedback | Use system selection colours; explain JavaScript is required | Styles reviewed; JavaScript-disabled regression |
| Data sharing was unclear | Explain that embedded search sends the question, selected rewards and recent conversation to Puter | Footer and README |
| Tests covered one browser engine | Run the same suite with Chromium, Firefox and WebKit in CI | See Browser checks workflow results |
| Phone banners and introductory content competed with typing and reading | Compact the phone header/banner, clear the banner during conversations, and reduce introductory content for short screens and an open keyboard | First-screen geometry checks at small iPhone sizes and a simulated iOS visual viewport |
| Later phone replies could remain below the screen | Scroll the document to the new reply on phones, preserving the separate desktop transcript scroll | Long-reply/follow-up regression checks both the start and end of answers against the sticky header and composer |
| Notices faded through low text contrast | Keep notice text opaque during its slide animation | WCAG checks cover the external prompt handoff notice |

The first audit also fixed clipboard/popup recovery, duplicate submissions, stale results after New chat, preference-storage failures, composition input, contrast and narrow-screen overflow. It removed the app's silent second paid request, added supported meta security policies, and verified project-relative asset paths. Those regression checks remain in the suite.

## Validation and limits

- The suite uses a server mounted at `/Avios-Bot/`, intercepts all external traffic and exercises success/error/timeout paths, prompt contents and automatic WCAG 2 A/AA and 2.1 AA checks. It does not establish financial accuracy or live service availability. See CI for per-engine results on each commit.
- Chromium and WebKit were exercised locally, and the CI matrix provides all three browser engines. WebKit caught a phone-banner visibility issue that Chromium and Firefox did not; explicit conversation state now controls its visibility. Physical iPhone testing remains separate from these engine checks.
- The deployed real SDK loads without page/CSP errors. Puter's public catalogue lists `perplexity/sonar-pro-search` as an alias of `openrouter:perplexity/sonar-pro-search`; the selected model is unchanged.
- The real clipboard-to-ChatGPT handoff passed on the deployed site. Popups for ChatGPT, Claude and Gemini are also exercised in the deterministic suite. Submitting the copied prompt inside another provider's account is outside this site's control and was not tested.
- The real Puter authentication window opens and closing it yields `auth_window_closed`. Its GUI assets (`gui-cdn.puter.com` and `puter-assets.b-cdn.net`) were denied by the cloud proxy. Successful account sign-in and live inference remain unverified. No credentials are stored in the repository and no live inference request was made during this audit.
- `npm audit` reported no known vulnerabilities in the installed development dependencies. There are no npm runtime dependencies.
- Automated accessibility checks supplement keyboard/layout checks; they do not replace testing with screen readers or physical iOS/Android devices.

## Hosting security

The 18 October advertising change adds Google's consent/advertising script hosts to the CSP, preserving the inline-script and base-injection protections. Google's published consent message manages consent; an additional TCF gate holds back the supplied AdSense loader and a browser-local block overrides it. `privacy.html` documents data use and identifies Gregory Tubby and the public contact `tubbygreg@pm.me`, supplied with permission for publication. The Google endpoints are denied by the cloud proxy, so actual message presentation and compatibility require a browser outside that proxy. No ad slot was added. All 54 consent-branch tests passed in Chromium, Firefox and WebKit before the operator contact copy was finalised; the privacy/mobile accessibility check was repeated for the final notice.

The previously failed production Chromium check was traced to the Tools dialog briefly retaining an old visual-viewport height during resize. Its CSS maximum height now also caps against `100dvh`, keeping it within the current layout viewport before the resize event updates the stored height. Existing viewport assertions are retained.

Observed Netlify responses supply HSTS, `X-Content-Type-Options: nosniff`, a `strict-origin-when-cross-origin` referrer policy, and a Permissions-Policy disabling camera, microphone and geolocation. GitHub Pages supplies HSTS. The HTML preserves the referrer policy and adds a CSP restricting script origins, embedded objects, base replacement and native form submission. Asset MIME types and HTML/JS/CSS contents were checked on the live Pages site.

GitHub Pages cannot apply Netlify `_headers` or arbitrary response headers. Full parity for `nosniff`/Permissions-Policy, or adding CSP `frame-ancestors`, requires a configurable hosting service or proxy. Unsupported meta tags would not provide that protection. The third-party Puter SDK remains trusted page code; its authentication and API are separate services.

## Further improvements, in priority order

Appearance now supports light, dark, high contrast and live device matching through Tools. Theme-specific accessibility checks cover chat, rewards, external handoff, comparison cards, saved answers and the calculator, alongside persistence, blocked storage and cross-tab updates. Palette choices do not affect reward data, prompt contents or AI allowances.

The product now includes opt-in saved recommendations/searches with favourites and validated import/export, guided purchase/hotel/flight/dining searches, responsive comparison cards, and a calculator using user-confirmed rates and sources. The existing Puter request count and model are unchanged. No alerts, backend, automatic history saving or live rate feed was added. The official issuer websites could not be accessed through the cloud network, so calculator defaults do not invent current rates. See README for the exact scope and financial-data limits.

1. **Validate real answer quality.** With a usable test account and permission to use its allowance, exercise exact products, upgrades, dining and travel. Check each material price/rewards claim against primary sources. Prompt instructions alone cannot guarantee accurate arithmetic, eligibility or stackability. Add structured source URLs, verification dates and exclusions to results before presenting totals as dependable comparisons.
2. **Gate production releases on tests.** Legacy Pages publishing from `main` can deploy while browser checks are still running. Require checks before merges, or move Pages deployment into a workflow that depends on the browser matrix.
3. **Complete account and device testing.** Test successful Puter sign-in, limits and real searches; manually check VoiceOver/TalkBack and iOS/Android clipboard/popup behaviour. WebKit CI is useful but is not physical Safari-device validation.
4. **Reduce third-party loading.** Avoid fetching Puter's SDK when a returning user has chosen “Use your AI”. Measure that change on a throttled mobile connection. The observed SDK is about 521 KB decoded, versus about 72 KB for this site's HTML/JS/CSS combined.
5. **Independently verify comparison data.** Comparison cards now expose cash prices, Avios, fees, eligibility, AI-reported source-check dates and source links. This presentation does not establish financial accuracy. Add optional exact Membership Rewards card details and a maintained, verified rate feed if automated calculator defaults are needed.
6. **Improve portability and maintenance.** Saved searches and their reward snapshots can now be exported/imported; live preference import remains separate. Consider hosting with configurable headers, pin CI actions to reviewed commit SHAs, and automate reviewed dependency updates. The custom domain is configured as `https://aviosmaxxing.co.uk/`, with HTTP and `www` redirecting to that HTTPS address.
