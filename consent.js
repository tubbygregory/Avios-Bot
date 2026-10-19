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
  let blocked = window.location.hash === '#advertising-off', allowed = false, started = false, listening = false;
  let readyTimer;
  try { blocked = blocked || localStorage.getItem(blockKey) === '1'; }
  catch (_) {
    blocked = true;
    storageStatus.textContent = 'This browser cannot read privacy preferences. Advertising is blocked by default. Changes apply for this visit.';
  }
  block.checked = blocked;

  function report(state, message) {
    document.documentElement.dataset.advertising = state;
    status.textContent = message;
  }
  function prepareDisplayAd() {
    const placement = document.getElementById('display-ad');
    const supplied = document.getElementById('display-ad-code')?.content.querySelector('ins');
    const slot = supplied?.dataset.adSlot || '';
    // Publisher IDs and ad-unit IDs are different. Never request an invented
    // slot or show an empty placeholder while the owner creates the real unit.
    if (!placement || !/^\d{1,20}$/.test(slot) || /^0+$/.test(slot)) return;
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
      const fill = new MutationObserver(() => {
        if (ad.dataset.adStatus === 'unfilled') {
          placement.hidden = true;
          placement.dataset.state = 'unfilled';
          fill.disconnect();
        } else if (ad.dataset.adStatus === 'filled') {
          placement.dataset.state = 'filled';
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
    if (started || !template) return;
    started = true;
    const supplied = template.content.querySelector('script');
    const script = document.createElement('script');
    script.id = 'adsense-sdk';
    script.async = true;
    script.src = supplied.src;
    script.crossOrigin = supplied.crossOrigin;
    script.addEventListener('load', () => {
      report('enabled', 'Google advertising is enabled under your current privacy choices.');
      prepareDisplayAd();
    });
    script.addEventListener('error', () => report('unavailable', 'Google advertising could not load. You can keep using Aviosmaxxing.'));
    report('loading', 'Loading Google advertising under your current privacy choices.');
    document.head.append(script);
  }
  function onConsent(data, success) {
    if (!success || !data || data.cmpStatus !== 'loaded') {
      allowed = false;
      if (started) apply();
      else report('unavailable', 'Google’s consent service has not confirmed your choices. Advertising stays off.');
      return;
    }
    // Opening the manager is not a new consent decision. Wait for completion.
    if (!['tcloaded', 'useractioncomplete'].includes(data.eventStatus)) return;
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
    if (listening || typeof window.__tcfapi !== 'function') return;
    try {
      window.__tcfapi('addEventListener', 2, onConsent);
      listening = true;
    } catch (_) {
      report('unavailable', 'Google’s consent service could not be contacted. Advertising stays off.');
    }
  }

  document.querySelectorAll('[data-privacy-choices]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
  document.getElementById('close-privacy').addEventListener('click', () => dialog.close());
  document.getElementById('review-google-consent').addEventListener('click', () => {
    if (typeof window.googlefc?.showRevocationMessage !== 'function') {
      status.textContent = 'Google’s privacy choices are unavailable. Use “Block advertising on this browser” to prevent advertising, or try again later.';
      return;
    }
    try {
      dialog.close();
      window.googlefc.showRevocationMessage();
    } catch (_) {
      dialog.showModal();
      status.textContent = 'Google’s privacy choices could not open. You can block advertising on this browser instead.';
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
  cmp.addEventListener('load', listen);
  cmp.addEventListener('error', () => report(blocked ? 'blocked' : 'unavailable', 'Google’s consent service could not load. Advertising stays off. You can keep using Aviosmaxxing.'));
  readyTimer = setTimeout(() => {
    if (!allowed && !blocked) report('unavailable', 'Google’s consent service has not confirmed your choices. Advertising stays off. You can keep using Aviosmaxxing.');
  }, 10000);
  document.head.append(cmp);
  listen();
})();
