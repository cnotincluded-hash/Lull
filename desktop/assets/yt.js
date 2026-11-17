/* Lull: YouTube ad blocking. Runs at the top of YouTube pages (and again after load as a fallback).
   Same approach as uBlock Origin's YouTube rules: strip ad data from the player and feed responses
   before YouTube's code reads them, hide leftover ad slots, and skip any ad that still plays. */
(function () {
  if (window.__lullYT) return;
  window.__lullYT = 1;
  var AD_KEYS = { adPlacements: 1, playerAds: 1, adSlots: 1, adBreakHeartbeatParams: 1, enforcementMessageViewModel: 1 };
  var ITEM_KEYS = {
    adSlotRenderer: 1, adSlotAndLayoutRenderer: 1, inFeedAdLayoutRenderer: 1, displayAdRenderer: 1,
    promotedSparklesWebRenderer: 1, promotedSparklesTextSearchRenderer: 1, promotedVideoRenderer: 1,
    compactPromotedVideoRenderer: 1, searchPyvRenderer: 1, bannerPromoRenderer: 1, statementBannerRenderer: 1,
    brandVideoShelfRenderer: 1, brandVideoSingletonRenderer: 1, companionAdRenderer: 1,
    actionCompanionAdRenderer: 1, mealbarPromoRenderer: 1, merchandiseShelfRenderer: 1, movieOfferModuleRenderer: 1
  };
  var ITEMS = /adSlot|AdRenderer|AdLayout|promoted|PromoRenderer|PyvRenderer|enforcementMessage|isAd"|merchandiseShelf|statementBanner|brandVideo|movieOffer/;
  var MARK = /adPlacements|playerAds|adSlots|adSlot|AdRenderer|AdLayout|promoted|PromoRenderer|PyvRenderer|enforcementMessage|isAd"|merchandiseShelf|statementBanner|brandVideo|movieOffer/;
  var NET = /\/youtubei\/v1\/(player|get_watch|next|browse|search|reel|guide)|\/watch\?|\/playlist\?|get_watch|\/player\?/;

  function hasItemKey(o) {
    if (!o || typeof o !== 'object') return false;
    for (var k in o) if (ITEM_KEYS[k]) return true;
    return false;
  }
  function isAdItem(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    if (hasItemKey(x)) return true;
    for (var k in x) {
      var v = x[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (hasItemKey(v.content)) return true;
        var rw = v.reelWatchEndpoint || (v.command && v.command.reelWatchEndpoint);
        if (rw && rw.adClientParams && rw.adClientParams.isAd) return true;
      }
    }
    if (x.command && x.command.reelWatchEndpoint && x.command.reelWatchEndpoint.adClientParams && x.command.reelWatchEndpoint.adClientParams.isAd) return true;
    return false;
  }
  function walk(o, d) {
    if (!o || typeof o !== 'object' || d > 64) return;
    if (Array.isArray(o)) {
      for (var i = o.length - 1; i >= 0; i--) {
        if (isAdItem(o[i])) o.splice(i, 1); else walk(o[i], d + 1);
      }
      return;
    }
    for (var k in o) {
      if (AD_KEYS[k]) { try { delete o[k]; } catch (e) { } continue; }
      var v = o[k];
      if (v && typeof v === 'object') walk(v, d + 1);
    }
  }
  function clean(o) { try { walk(o, 0); } catch (e) { } return o; }
  function fixText(t) {
    if (typeof t !== 'string' || !MARK.test(t)) return t;
    t = t.replace(/"(adPlacements|adSlots|playerAds)"/g, '"no_ads"');
    if (ITEMS.test(t)) {
      var pre = '', body = t, m = /^\)\]\}'\s*/.exec(t);
      if (m) { pre = m[0]; body = t.slice(pre.length); }
      try { return pre + JSON.stringify(clean(oParse(body))); } catch (e) { }
    }
    return t;
  }
  function native(fn, name) {
    try { Object.defineProperty(fn, 'toString', { value: function () { return 'function ' + name + '() { [native code] }'; } }); } catch (e) { }
    return fn;
  }

  /* JSON.parse */
  var oParse = JSON.parse;
  JSON.parse = native(function (t) {
    var o = oParse.apply(this, arguments);
    if (typeof t === 'string' && t.length > 80 && MARK.test(t)) clean(o);
    return o;
  }, 'parse');

  /* fetch: rewrite the body of player, watch and feed responses */
  var oFetch = window.fetch;
  if (oFetch) {
    window.fetch = native(function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = oFetch.apply(this, arguments);
      if (!NET.test(url)) return p;
      return p.then(function (res) {
        if (!res || !res.ok) return res;
        var ct = (res.headers && res.headers.get('content-type')) || '';
        if (ct && !/json|javascript|text/.test(ct)) return res;
        return res.clone().text().then(function (t) {
          var f = fixText(t);
          if (f === t) return res;
          var out = new Response(f, { status: res.status, statusText: res.statusText, headers: res.headers });
          try { Object.defineProperty(out, 'url', { value: res.url }); Object.defineProperty(out, 'type', { value: res.type }); Object.defineProperty(out, 'redirected', { value: res.redirected }); } catch (e) { }
          return out;
        }, function () { return res; });
      });
    }, 'fetch');
  }
  var oJson = Response.prototype.json;
  Response.prototype.json = native(function () {
    return oJson.apply(this, arguments).then(clean);
  }, 'json');

  /* XMLHttpRequest */
  var X = XMLHttpRequest.prototype, oOpen = X.open;
  X.open = native(function (m, url) { this.__lullUrl = String(url || ''); return oOpen.apply(this, arguments); }, 'open');
  ['responseText', 'response'].forEach(function (prop) {
    var d = Object.getOwnPropertyDescriptor(X, prop);
    if (!d || !d.get) return;
    Object.defineProperty(X, prop, {
      configurable: true, enumerable: d.enumerable,
      get: native(function () {
        var v = d.get.call(this);
        if (this.readyState !== 4 || !NET.test(this.__lullUrl || '')) return v;
        var key = '__lull_' + prop;
        if (this[key] && this[key][0] === v) return this[key][1];
        var f = typeof v === 'string' ? fixText(v) : (v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype) ? clean(v) : v);
        this[key] = [v, f];
        return f;
      }, 'get ' + prop)
    });
  });

  /* Values YouTube writes straight into the page */
  ['ytInitialPlayerResponse', 'ytInitialData', 'playerResponse'].forEach(function (name) {
    try {
      var val = window[name];
      if (val) clean(val);
      Object.defineProperty(window, name, { configurable: true, get: function () { return val; }, set: function (v) { val = clean(v); } });
    } catch (e) { }
  });

  /* Ad-blocker detection hook ("abnormality") */
  try {
    var oThen = Promise.prototype.then;
    Promise.prototype.then = native(function (a) {
      if (typeof a === 'function') { try { if (Function.prototype.toString.call(a).indexOf('onAbnormalityDetected') >= 0) arguments[0] = function () { }; } catch (e) { } }
      return oThen.apply(this, arguments);
    }, 'then');
  } catch (e) { }

  /* A service worker would serve pages Lull can't clean, so don't let YouTube keep one */
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });
      navigator.serviceWorker.register = native(function () { return Promise.reject(new Error('disabled')); }, 'register');
    }
  } catch (e) { }

  /* Hide what's left */
  var css = [
    '#masthead-ad', 'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer', 'ytd-search-pyv-renderer', 'ytd-banner-promo-renderer', 'ytd-statement-banner-renderer',
    'ytd-brand-video-shelf-renderer', 'ytd-brand-video-singleton-renderer', 'ytd-merch-shelf-renderer', 'ytd-mealbar-promo-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer', '#player-ads', '.video-ads', '.ytp-ad-module', '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay', '.ytp-ad-text-overlay', '#shopping-timely-shelf', 'yt-overlay-product-sticker',
    'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)', 'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
    '.ytd-shorts:has(> .ytd-reel-video-renderer > ytd-ad-slot-renderer)',
    'ad-slot-renderer', 'ytm-rich-item-renderer:has(> ad-slot-renderer)', 'lazy-list > ad-slot-renderer',
    'ytm-companion-ad-renderer', 'ytm-companion-slot', 'ytm-promoted-sparkles-web-renderer', 'ytm-promoted-video-renderer',
    'ytm-promoted-sparkles-text-search-renderer', 'ytm-mealbar-promo-renderer', 'ytm-statement-banner-renderer',
    'ytm-in-feed-ad-layout-renderer', 'ytm-item-section-renderer:has(> lazy-list > ad-slot-renderer:only-child)',
    'ytd-enforcement-message-view-model', 'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)'
  ].join(',') + '{display:none!important}';
  function addStyle() {
    var root = document.head || document.documentElement;
    if (!root) return false;
    var s = document.createElement('style');
    s.id = 'lull-yt';
    s.textContent = css;
    root.appendChild(s);
    return true;
  }
  if (!addStyle()) document.addEventListener('DOMContentLoaded', addStyle);

  /* Skip any ad that still plays */
  var skipSel = '.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-container button,.ytm-skip-ad-button,button[class*="skip-ad"],button[class*="ad-skip"]';
  setInterval(function () {
    var player = document.querySelector('.html5-video-player.ad-showing,.html5-video-player.ad-interrupting,#movie_player.ad-showing');
    var vids = document.querySelectorAll('video');
    if (player) {
      var v = player.querySelector('video');
      if (v) {
        if (!v.__lullSkip) { v.__lullSkip = 1; v.__lullMuted = v.muted; v.__lullRate = v.playbackRate || 1; }
        v.muted = true;
        if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.3) { try { v.currentTime = v.duration - 0.1; } catch (e) { } }
        try { v.playbackRate = 16; } catch (e) { }
      }
      var b = document.querySelector(skipSel);
      if (b) b.click();
    } else {
      for (var i = 0; i < vids.length; i++) {
        var w = vids[i];
        if (w.__lullSkip) { w.__lullSkip = 0; w.muted = w.__lullMuted; try { w.playbackRate = w.__lullRate; } catch (e) { } }
      }
    }
    /* "Video paused. Continue watching?" */
    var dlgs = document.querySelectorAll('yt-confirm-dialog-renderer, ytm-dialog, tp-yt-paper-dialog, .dialog');
    for (var j = 0; j < dlgs.length; j++) {
      var d = dlgs[j];
      if (d.offsetParent !== null && /continue watching|video paused|still watching/i.test(d.textContent || '')) {
        var yes = d.querySelector('#confirm-button button, #confirm-button, button[aria-label*="Yes"], .dialog-buttons button:last-child, button');
        if (yes) yes.click();
        var pv = document.querySelector('#movie_player video, video');
        if (pv && pv.paused) pv.play().catch(function () { });
      }
    }
    var enf = document.querySelector('ytd-enforcement-message-view-model');
    if (enf) {
      var dlg = enf.closest('tp-yt-paper-dialog');
      if (dlg) dlg.remove();
      var bd = document.querySelector('tp-yt-iron-overlay-backdrop');
      if (bd) bd.remove();
      var mv = document.querySelector('#movie_player video');
      if (mv && mv.paused) mv.play().catch(function () { });
    }
  }, 300);
})();
