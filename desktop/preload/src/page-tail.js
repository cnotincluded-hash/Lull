
if (cfg.youtube) inMain(lullYouTube);

// Cookie banners: hide the common consent pop-ups and unlock scrolling.
if (cfg.cookies && window.top === window) {
  const sel = '#onetrust-banner-sdk,#onetrust-consent-sdk,.onetrust-pc-dark-filter,#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,#usercentrics-root,#usercentrics-cmp-ui,#didomi-host,#didomi-notice,.didomi-popup-backdrop,#qc-cmp2-container,.qc-cmp2-container,[id^="sp_message_container"],.fc-consent-root,.fc-dialog-overlay,.cc-window,.cc-banner,#cookie-law-info-bar,#cookie-notice,#cookieNotice,#cookie-banner,.cookie-banner,#cookiebanner,.cookie-consent,#cookie-consent,#cmpbox,#cmpbox2,.cmpboxBG,#truste-consent-track,.truste_box_overlay,.truste_overlay,.osano-cm-window,#iubenda-cs-banner,.iubenda-cs-container,#gdpr-cookie-message,.gdpr-banner,#consent_blackbar,.evidon-banner,#BorlabsCookieBox,.cky-consent-container,.cky-overlay,#moove_gdpr_cookie_info_bar,.cmplz-cookiebanner,#termly-code-snippet-support,#cookiescript_injected,#hs-eu-cookie-confirmation,#consent-banner,.consent-banner,#gdpr-banner,.cookie-notice,.cookies-banner,#cookies-banner,.js-cookie-banner,#ccc,#ccc-overlay';
  const addStyle = () => {
    const s = document.createElement('style');
    s.textContent = sel + '{display:none!important;visibility:hidden!important;pointer-events:none!important}';
    (document.head || document.documentElement).appendChild(s);
  };
  const unlock = () => {
    const h = document.documentElement, b = document.body;
    ['sp-message-open', 'didomi-popup-open', 'qc-cmp-ui-showing', 'cmp-open', 'cookie-consent-open', 'fc-consent-open'].forEach((k) => { h.classList.remove(k); if (b) b.classList.remove(k); });
    if (!document.querySelector(sel)) return;
    [h, b].forEach((e) => { if (!e) return; const c = getComputedStyle(e); if (c.overflow === 'hidden' || c.overflowY === 'hidden') e.style.setProperty('overflow', 'auto', 'important'); });
  };
  if (document.documentElement) addStyle(); else document.addEventListener('readystatechange', addStyle, { once: true });
  window.addEventListener('DOMContentLoaded', () => { unlock(); setTimeout(unlock, 1200); setTimeout(unlock, 3500); });
}

// Glance: Alt-click (Option-click on a Mac) a link to preview it.
if (cfg.glance) {
  window.addEventListener('click', (e) => {
    if (!e.altKey || e.button !== 0) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !/^https?:/i.test(a.href)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ipcRenderer.send('lull:glance', a.href);
  }, true);
}
