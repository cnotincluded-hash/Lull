/* Lull: let audio and video keep playing when Lull is in the background or the screen is off.
   Pages (YouTube especially) pause when they're told they're hidden, so they're always told they're visible. */
(function () {
  if (window.__lullBg) return;
  window.__lullBg = 1;
  try {
    var P = Document.prototype;
    Object.defineProperty(P, 'hidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(P, 'visibilityState', { configurable: true, get: function () { return 'visible'; } });
    Object.defineProperty(P, 'webkitHidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(P, 'webkitVisibilityState', { configurable: true, get: function () { return 'visible'; } });
  } catch (e) { }
  try { Document.prototype.hasFocus = function () { return true; }; } catch (e) { }
  window.addEventListener('blur', function (e) { if (e.target === window) e.stopImmediatePropagation(); }, true);
  ['visibilitychange', 'webkitvisibilitychange'].forEach(function (t) {
    window.addEventListener(t, function (e) { e.stopImmediatePropagation(); }, true);
    document.addEventListener(t, function (e) { e.stopImmediatePropagation(); }, true);
  });
})();
