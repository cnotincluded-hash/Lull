(function(){try{
if(window.__lullc)return;window.__lullc=1;
var sel='#onetrust-banner-sdk,#onetrust-consent-sdk,.onetrust-pc-dark-filter,#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,#usercentrics-root,#usercentrics-cmp-ui,#didomi-host,#didomi-notice,.didomi-popup-backdrop,#qc-cmp2-container,.qc-cmp2-container,[id^="sp_message_container"],.fc-consent-root,.fc-dialog-overlay,.cc-window,.cc-banner,#cookie-law-info-bar,#cookie-notice,#cookieNotice,#cookie-banner,.cookie-banner,#cookiebanner,.cookie-consent,#cookie-consent,#cmpbox,#cmpbox2,.cmpboxBG,#truste-consent-track,.truste_box_overlay,.truste_overlay,.osano-cm-window,#iubenda-cs-banner,.iubenda-cs-container,#gdpr-cookie-message,.gdpr-banner,#consent_blackbar,.evidon-banner,#BorlabsCookieBox,.cky-consent-container,.cky-overlay,#moove_gdpr_cookie_info_bar,.cmplz-cookiebanner,#termly-code-snippet-support,#cookiescript_injected,#hs-eu-cookie-confirmation,#consent-banner,.consent-banner,#gdpr-banner,.cookie-notice,.cookies-banner,#cookies-banner,.js-cookie-banner,#ccc,#ccc-overlay';
var s=document.createElement('style');s.textContent=sel+'{display:none!important;visibility:hidden!important;pointer-events:none!important}';
(document.head||document.documentElement).appendChild(s);
function unlock(){var h=document.documentElement,b=document.body;
 ['sp-message-open','didomi-popup-open','qc-cmp-ui-showing','cmp-open','cookie-consent-open','fc-consent-open'].forEach(function(k){h.classList.remove(k);if(b)b.classList.remove(k)});
 if(!document.querySelector(sel))return;
 [h,b].forEach(function(e){if(!e)return;var c=getComputedStyle(e);if(c.overflow==='hidden'||c.overflowY==='hidden'){e.style.setProperty('overflow','auto','important')}if(c.position==='fixed'&&e===b){e.style.setProperty('position','static','important')}});}
unlock();setTimeout(unlock,1200);setTimeout(unlock,3500);
}catch(e){}})();
