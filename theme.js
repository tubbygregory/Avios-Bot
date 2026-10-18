// Apply before the stylesheet to avoid flashing the light palette on reload.
(() => {
  'use strict';
  const key = 'aviosmaxxing-appearance-v1';
  const choices = ['system', 'light', 'dark', 'contrast'];
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const contrast = window.matchMedia('(prefers-contrast: more)');
  const forced = window.matchMedia('(forced-colors: active)');
  const normalise = value => choices.includes(value) ? value : 'system';
  let preference = 'system';
  try { preference = normalise(localStorage.getItem(key)); } catch (_) {}

  function apply() {
    // Some browsers retain stale query objects after a device/emulation change.
    // Resolve fresh values when returning from system settings or a home screen.
    const matches = query => window.matchMedia(query.media).matches;
    const deviceTheme = matches(contrast) || matches(forced) ? 'contrast' : matches(dark) ? 'dark' : 'light';
    const theme = preference === 'system' ? deviceTheme : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.appearance = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
      { light: '#f5f8fc', dark: '#131e30', contrast: '#000000' }[theme]);
    const select = document.getElementById('appearance');
    if (select) select.value = preference;
  }
  apply();
  [dark, contrast, forced].forEach(query => query.addEventListener('change', () => {
    if (preference === 'system') apply();
  }));
  window.addEventListener('focus', apply);
  window.addEventListener('pageshow', apply);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = normalise(event.newValue);
    apply();
    const status = document.getElementById('appearance-status');
    if (status) status.textContent = 'Appearance updated from another tab.';
  });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('appearance');
    if (!select) return;
    select.value = preference;
    select.addEventListener('change', () => {
      preference = normalise(select.value);
      apply();
      const status = document.getElementById('appearance-status');
      try {
        localStorage.setItem(key, preference);
        status.textContent = preference === 'system' ? 'Following your device settings. Choice saved on this browser.' : 'Choice saved on this browser.';
      } catch (_) {
        status.textContent = 'Applied for this visit. This browser could not save your choice.';
      }
    });
  });
})();
