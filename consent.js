// Google's published European-regulations message is the consent manager.
// This is an extra fail-closed loader, not a replacement consent banner.
(() => {
  'use strict';
  const blockKey = 'aviosmaxxing-advertising-blocked-v1';
  const dialog = document.getElementById('privacy-dialog');
  const status = document.getElementById('privacy-status');
  const block = document.getElementById('block-advertising');
  const storageStatus = document.getElementById('privacy-storage');
  const template = document.getElementById('adsense-code');
  const diagnostics = document.getElementById('advertising-diagnostics');
  let blocked = window.location.hash === '#advertising-off', allowed = false, started = false;
  let subscription = null;
  let sdkState = 'idle';
  let consentScriptState = 'loading', consentCallback = 'not received', cmpStatus = 'not received', consentEvent = 'not received', gdprStatus = 'not received';
  let reviewState = 'not requested';
  const blockedScripts = new Set();
  let deliveryMessage = 'Advertising is permitted. The collapsible ad is below the app and loads when scrolled into view.';
  let readyTimer;
  try { blocked = blocked || localStorage.getItem(blockKey) === '1'; }
  catch (_) {
    blocked = true;
    storageStatus.textContent = 'This browser cannot read privacy preferences. Advertising is blocked by default. Changes apply for this visit.';
  }
  block.checked = blocked;

  function updateDiagnostics() {
    if (!diagnostics) return;
    // Never include TC strings, cookies, searches, rewards or arbitrary URLs.
    const details = [
      'Aviosmaxxing advertising diagnostics v2',
      `Site: ${window.location.origin}`,
      `Consent script: ${consentScriptState}`,
      `Consent API: ${typeof window.__tcfapi === 'function' ? 'available' : 'unavailable'}`,
      `Consent subscription: ${subscription ? subscription.confirmed ? 'confirmed' : 'pending' : 'none'}`,
      `Consent callback: ${consentCallback}`,
      `CMP state: ${cmpStatus}`,
      `Consent event: ${consentEvent}`,
      `Google GDPR applicability: ${gdprStatus}`,
      `Google review API: ${typeof window.googlefc?.showRevocationMessage === 'function' ? 'available' : 'unavailable'}`,
      `Review request: ${reviewState}`,
      `Browser advertising block: ${blocked ? 'on' : 'off'}`,
      `Ad script: ${sdkState}`,
      `Advertising state: ${document.documentElement.dataset.advertising || 'waiting'}`,
      `Scripts blocked by page security policy: ${[...blockedScripts].join(', ') || 'none observed'}`
    ].join('\n');
    // Preserve the rendered text and any selection when only opening or
    // copying the readout; replacing unchanged text can disrupt both.
    if (diagnostics.textContent !== details) diagnostics.textContent = details;
  }
  function report(state, message) {
    document.documentElement.dataset.advertising = state;
    status.textContent = message;
    updateDiagnostics();
  }
  function reportDelivery(message = deliveryMessage) {
    deliveryMessage = message;
    if (allowed && !blocked) report('enabled', message);
  }
  function reportSdkState() {
    if (sdkState === 'ready') reportDelivery();
    else if (sdkState === 'failed') report('unavailable', 'Google advertising could not load. You can keep using Aviosmaxxing.');
    else report('loading', 'Loading Google advertising under your current privacy choices.');
  }
  function prepareDisplayAd() {
    const placement = document.getElementById('display-ad');
    const supplied = document.getElementById('display-ad-code')?.content.querySelector('ins');
    const slot = supplied?.dataset.adSlot || '';
    // Publisher IDs and ad-unit IDs are different. Never request an invented
    // slot or show an empty placeholder while the owner creates the real unit.
    if (!placement || !/^\d{1,20}$/.test(slot) || /^0+$/.test(slot)) {
      reportDelivery('Advertising is permitted, but this page has no configured ad placement.');
      return;
    }
    const content = document.getElementById('display-ad-content');
    const toggle = document.getElementById('toggle-display-ad');
    placement.hidden = false;
    placement.dataset.state = 'waiting';
    let requested = false;
    let visibility;
    function request() {
      if (requested || blocked || !allowed || document.hidden || content.hidden) return;
      const bounds = content.getBoundingClientRect();
      if (bounds.top >= window.innerHeight || bounds.bottom <= 0) return;
      requested = true;
      visibility?.disconnect();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      document.removeEventListener('visibilitychange', request);
      const ad = supplied.cloneNode(true);
      content.append(ad);
      placement.dataset.state = 'requested';
      reportDelivery('An ad has been requested. Waiting for Google to return it.');
      const fill = new MutationObserver(() => {
        if (ad.dataset.adStatus === 'unfilled') {
          placement.hidden = true;
          placement.dataset.state = 'unfilled';
          reportDelivery('Google did not supply an ad for this visit. The empty placement is hidden.');
          fill.disconnect();
        } else if (ad.dataset.adStatus === 'filled') {
          placement.dataset.state = 'filled';
          reportDelivery('Google has supplied an ad below the app. Use Show ad if you collapsed it.');
          fill.disconnect();
        }
      });
      fill.observe(ad, { attributes: true, attributeFilter: ['data-ad-status'] });
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (_) {
        fill.disconnect();
        placement.hidden = true;
        placement.dataset.state = 'failed';
        reportDelivery('Google could not initialise this ad. The empty placement is hidden.');
      }
    }
    if (typeof IntersectionObserver === 'function') {
      visibility = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) request();
      });
      visibility.observe(content);
    } else {
      window.addEventListener('scroll', request, { passive: true });
    }
    window.addEventListener('resize', request);
    document.addEventListener('visibilitychange', request);
    toggle.addEventListener('click', () => {
      content.hidden = !content.hidden;
      toggle.setAttribute('aria-expanded', String(!content.hidden));
      toggle.textContent = content.hidden ? 'Show ad' : 'Hide ad';
      // Reopening retains the existing ad. If it has not loaded yet, the same
      // consent and visibility checks still apply before its first request.
      if (!content.hidden) request();
    });
    request();
  }
  function apply() {
    if (blocked || !allowed) {
      if (started) {
        // Removing a script cannot undo its cookies, frames or running code.
        // Reload after revocation so the next page starts without the ad SDK.
        window.location.reload();
        return;
      }
      report(blocked ? 'blocked' : 'declined', blocked
        ? 'Advertising is blocked on this browser. You can still review Google’s stored privacy choices.'
        : 'Advertising is off under the current Google privacy choices.');
      return;
    }
    if (started) {
      reportSdkState();
      return;
    }
    if (!template) return;
    started = true;
    sdkState = 'loading';
    const supplied = template.content.querySelector('script');
    const script = document.createElement('script');
    script.id = 'adsense-sdk';
    script.async = true;
    script.src = supplied.src;
    script.crossOrigin = supplied.crossOrigin;
    script.addEventListener('load', () => {
      sdkState = 'ready';
      reportDelivery();
      prepareDisplayAd();
    });
    script.addEventListener('error', () => {
      sdkState = 'failed';
      reportSdkState();
    });
    reportSdkState();
    document.head.append(script);
  }
  function readyConsentData(data) {
    // IAB TCData outside GDPR may contain only gdprApplies, tcfPolicyVersion,
    // cmpId and cmpVersion, with no cmpStatus or eventStatus. An explicit
    // loading/stub/error result must still never be treated as ready.
    return data?.cmpStatus === 'loaded' || (data?.gdprApplies === false && data.cmpStatus === undefined);
  }
  function onConsent(data, success) {
    consentCallback = success === true ? 'successful' : 'unsuccessful';
    cmpStatus = ['stub', 'loading', 'loaded', 'error'].includes(data?.cmpStatus) ? data.cmpStatus : 'unknown';
    consentEvent = data?.eventStatus === undefined ? 'not provided' : ['tcloaded', 'cmpuishown', 'useractioncomplete'].includes(data.eventStatus) ? data.eventStatus : 'unrecognised';
    gdprStatus = data?.gdprApplies === true ? 'applies' : data?.gdprApplies === false ? 'does not apply' : 'unknown';
    updateDiagnostics();
    if (success !== true || !readyConsentData(data)) {
      allowed = false;
      if (started || blocked) apply();
      else report('unavailable', 'Google’s consent service has not confirmed your choices. Advertising stays off.');
      return;
    }
    // A visible message is a working CMP awaiting the visitor, not a service
    // timeout. Opening it does not change previously confirmed permissions.
    if (data.gdprApplies !== false && data.eventStatus === 'cmpuishown') {
      clearTimeout(readyTimer);
      report(blocked ? 'blocked' : started ? 'enabled' : 'waiting', blocked
        ? 'Advertising is blocked on this browser. You can still review Google’s privacy message.'
        : 'Google’s privacy message is open. Accept, reject or manage your choices there.');
      return;
    }
    if (data.gdprApplies !== false && !['tcloaded', 'useractioncomplete'].includes(data.eventStatus)) return;
    clearTimeout(readyTimer);
    // A missing/unknown jurisdiction or incomplete TC string must not bypass
    // consent. Google vendor 755 + purpose 1 is only the minimum storage gate;
    // Google's ad SDK remains responsible for all other TCF purposes/signals.
    allowed = data.gdprApplies === false || (data.gdprApplies === true &&
      typeof data.tcString === 'string' && data.tcString.length > 0 &&
      data.vendor?.consents?.[755] === true && data.purpose?.consents?.[1] === true);
    apply();
    if (!template && allowed && !blocked) report('ready', 'Google’s privacy choices are loaded. No advertising is displayed on this privacy notice.');
  }
  function listen() {
    const api = window.__tcfapi;
    if (typeof api !== 'function' || (subscription?.api === api && subscription.confirmed)) return;
    const next = { api, confirmed: false };
    subscription = next;
    try {
      api.call(window, 'addEventListener', 2, (data, success) => {
        if (subscription !== next) return; // Discard callbacks from an old API.
        // A stub may reject registration synchronously. Clear it inside the
        // callback so a later readiness event can retry the same API function.
        if (success !== true && !next.confirmed) subscription = null;
        if (success === true && readyConsentData(data)) next.confirmed = true;
        onConsent(data, success);
      });
    } catch (_) {
      if (subscription === next) subscription = null;
      report('unavailable', 'Google’s consent service could not be contacted. Advertising stays off.');
    }
  }

  document.querySelectorAll('[data-privacy-choices]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
  document.getElementById('close-privacy').addEventListener('click', () => dialog.close());
  document.getElementById('review-google-consent').addEventListener('click', () => {
    listen();
    if (typeof window.googlefc?.showRevocationMessage !== 'function') {
      reviewState = 'API unavailable';
      updateDiagnostics();
      status.textContent = 'Google’s privacy choices are unavailable. Use “Block advertising on this browser” to prevent advertising, or try again later.';
      return;
    }
    try {
      reviewState = 'sent to Google';
      updateDiagnostics();
      dialog.close();
      window.googlefc.showRevocationMessage();
    } catch (_) {
      reviewState = 'API threw an error';
      updateDiagnostics();
      dialog.showModal();
      status.textContent = 'Google’s privacy choices could not open. You can block advertising on this browser instead.';
    }
  });
  document.getElementById('advertising-troubleshooting')?.addEventListener('toggle', updateDiagnostics);
  document.getElementById('copy-advertising-diagnostics')?.addEventListener('click', async () => {
    updateDiagnostics();
    const result = document.getElementById('advertising-copy-status');
    try {
      await navigator.clipboard.writeText(diagnostics.textContent);
      result.textContent = 'Loading details copied. You can paste them into your support message.';
    } catch (_) {
      diagnostics.focus();
      const range = document.createRange();
      range.selectNodeContents(diagnostics);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      result.textContent = 'Automatic copying is unavailable. The loading details are selected; use Copy or press Ctrl+C.';
    }
  });
  document.addEventListener('securitypolicyviolation', event => {
    if (event.disposition === 'report' || !event.effectiveDirective?.startsWith('script-src')) return;
    let source;
    if (event.blockedURI === 'inline' || event.blockedURI === 'eval') source = event.blockedURI;
    else {
      try {
        const host = new URL(event.blockedURI).hostname;
        if (['google.com', 'googlesyndication.com', 'googletagservices.com', 'gstatic.com', 'doubleclick.net', 'adtrafficquality.google'].some(domain => host === domain || host.endsWith('.' + domain))) source = host;
      } catch (_) { /* No arbitrary event text enters diagnostics. */ }
    }
    if (source) {
      blockedScripts.add(source);
      updateDiagnostics();
    }
  });
  block.addEventListener('change', () => {
    blocked = block.checked;
    if (!blocked && window.location.hash === '#advertising-off') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    try {
      localStorage.setItem(blockKey, blocked ? '1' : '0');
      storageStatus.textContent = 'Advertising block saved on this browser. Turning it on reloads the page if advertising has already started.';
    } catch (_) {
      // Keep an explicit opt-out through the necessary reload even if both
      // local/session storage are unavailable. Fragments are not sent to servers.
      if (blocked) history.replaceState(null, '', window.location.pathname + window.location.search + '#advertising-off');
      storageStatus.textContent = 'This browser could not save the block. It applies for this visit, including reloads of this address; use Google’s choices to manage its stored consent too.';
    }
    apply();
  });
  window.addEventListener('storage', event => {
    if (event.key !== blockKey && event.key !== null) return;
    // Clearing preferences must not silently remove an explicit block.
    if (event.newValue === null) return;
    blocked = event.newValue === '1';
    block.checked = blocked;
    apply();
  });

  report(blocked ? 'blocked' : 'waiting', blocked
    ? 'Advertising is blocked on this browser.'
    : 'Waiting for Google’s consent service. Advertising stays off while consent is unresolved.');
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  window.googlefc.callbackQueue.push({ CONSENT_API_READY: listen });
  // Google's standard presence signal avoids duplicate message bootstraps.
  if (!window.frames.googlefcPresent) {
    const signal = document.createElement('iframe');
    signal.name = 'googlefcPresent';
    signal.title = 'Google consent manager presence';
    signal.hidden = true;
    document.body.append(signal);
  }
  const cmp = document.createElement('script');
  cmp.id = 'google-consent-manager';
  cmp.async = true;
  cmp.src = 'https://fundingchoicesmessages.google.com/i/pub-8404673257565926?ers=1';
  cmp.addEventListener('load', () => {
    consentScriptState = 'loaded';
    listen();
    updateDiagnostics();
  });
  cmp.addEventListener('error', () => {
    consentScriptState = 'failed';
    report(blocked ? 'blocked' : 'unavailable', 'Google’s consent service could not load. Advertising stays off. You can keep using Aviosmaxxing.');
  });
  readyTimer = setTimeout(() => {
    if (!allowed && !blocked) report('unavailable', 'Google’s consent service has not confirmed your choices. Advertising stays off. You can keep using Aviosmaxxing.');
  }, 10000);
  document.head.append(cmp);
  listen();
})();
