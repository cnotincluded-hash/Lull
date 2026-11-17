'use strict';
// One Lull window: the sidebar interface (a transparent view on top) plus one view per tab.
const path = require('path');
const fs = require('fs');
const {
  app, BaseWindow, WebContentsView, Menu, clipboard, shell, session, dialog, ipcMain, nativeTheme, screen
} = require('electron');
const store = require('./store');
const blocker = require('./blocker');
const media = require('./media');

const IS_MAC = process.platform === 'darwin';
const MAX_LIVE = 10;
const windows = new Set();
const byContents = new Map(); // webContents id -> { owner, tab }
let privateCount = 0;

const ROOT = path.join(__dirname, '..');
const READER = fs.readFileSync(path.join(ROOT, 'assets', 'readability.js'), 'utf8') + '\n;' + fs.readFileSync(path.join(ROOT, 'assets', 'reader.js'), 'utf8');

// Settings the interface pushes down (blocking, pop-ups, YouTube, autoplay...).
let settings = Object.assign({ ads: true, cookies: true, popups: true, redirects: true, youtube: true, autoplay: true, autoPip: true, updateLists: true, allow: [], engine: 'ddg' }, store.get('settings', {}));

function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
function bare(h) { return (h || '').replace(/^www\./, ''); }
function siteOf(host) {
  const h = bare((host || '').toLowerCase());
  const p = h.split('.');
  if (p.length <= 2) return h;
  const tld = p[p.length - 1], sld = p[p.length - 2];
  const two = sld + '.' + tld;
  const cc = tld.length === 2 && (sld.length <= 3 || ['gov', 'ac', 'co', 'com', 'net', 'org', 'edu'].includes(sld));
  return cc ? p[p.length - 3] + '.' + two : two;
}
function allowed(host) {
  const h = bare(host);
  return !!h && (settings.allow || []).some((a) => h === a || h.endsWith('.' + a));
}
const isYouTube = (h) => /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$/.test(h || '');
const SEARCH = { ddg: 'https://duckduckgo.com/?q=', google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', brave: 'https://search.brave.com/search?q=', ecosia: 'https://www.ecosia.org/search?q=', startpage: 'https://www.startpage.com/do/search?q=' };

function applySettings(next) {
  settings = Object.assign(settings, next || {});
  store.set('settings', settings);
  blocker.setEnabled(settings.ads !== false);
  blocker.setAllow(settings.allow || []);
  for (const w of windows) for (const t of w.tabs.values()) { try { t.wc.setAudioMuted(!!t.muted); } catch (e) { /* closed */ } }
}

/* ---------------- sessions ---------------- */
const ASK = {
  media: 'use your camera and microphone',
  geolocation: 'know your location',
  notifications: 'show you notifications',
  'clipboard-read': 'see what you copied',
  'display-capture': 'see your screen',
  midi: 'use your MIDI devices',
  midiSysex: 'use your MIDI devices',
  'idle-detection': 'know when you are away',
  'window-management': 'manage windows on your screens'
};
const SAFE = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'speaker-selection']);

function prepareSession(ses, priv) {
  if (ses.__lull) return;
  ses.__lull = true;
  ses.setUserAgent(ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ lull\/\S+/i, ''));
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(ROOT, 'preload', 'page.js') });
  blocker.addSession(ses);
  const remembered = priv ? {} : null;
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (SAFE.has(permission)) return cb(true);
    let what = ASK[permission];
    if (!what) return cb(false);
    if (permission === 'media' && details && details.mediaTypes) {
      const v = details.mediaTypes.includes('video'), a = details.mediaTypes.includes('audio');
      what = v && a ? 'use your camera and microphone' : v ? 'use your camera' : 'use your microphone';
    }
    let origin = '';
    try { origin = new URL((details && details.requestingUrl) || wc.getURL()).origin; } catch (e) { return cb(false); }
    const key = origin + '|' + permission;
    const saved = remembered ? remembered : store.get('permissions', {});
    if (key in saved) return cb(!!saved[key]);
    const own = byContents.get(wc.id);
    const parent = own ? own.owner.win : undefined;
    const opts = { type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1, message: bare(new URL(origin).hostname) + ' wants to ' + what, checkboxLabel: 'Remember my choice for this site', checkboxChecked: true };
    (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts)).then((r) => {
      const ok = r.response === 0;
      if (r.checkboxChecked) {
        if (remembered) remembered[key] = ok;
        else { const all = store.get('permissions', {}); all[key] = ok; store.set('permissions', all); }
      }
      cb(ok);
    }).catch(() => cb(false));
  });
  ses.on('will-download', (e, item, wc) => {
    const dir = app.getPath('downloads');
    const name = (item.getFilename() || 'download').replace(/[\\/:*?"<>|]/g, '_');
    const ext = path.extname(name), stem = path.basename(name, ext);
    let p = path.join(dir, name), n = 1;
    while (fs.existsSync(p)) p = path.join(dir, stem + ' (' + (n++) + ')' + ext);
    item.setSavePath(p);
    const own = wc && byContents.get(wc.id);
    const owner = own ? own.owner : Array.from(windows).find((w) => w.ses === ses);
    if (owner) owner.emit('download', { name: path.basename(p), path: p, state: 'started' });
    item.once('done', (_e, state) => { if (owner) owner.emit('download', { name: path.basename(p), path: p, state }); });
  });
}

/* ---------------- window ---------------- */
class LullWindow {
  constructor(opts = {}) {
    this.priv = !!opts.private;
    this.ses = this.priv ? session.fromPartition('lull-private-' + (++privateCount)) : session.fromPartition('persist:lull');
    prepareSession(this.ses, this.priv);
    const saved = this.priv ? null : store.get('window', null);
    const wa = screen.getPrimaryDisplay().workArea;
    const width = Math.min((saved && saved.width) || 1320, wa.width), height = Math.min((saved && saved.height) || 860, wa.height);
    const winOpts = {
      width, height, minWidth: 560, minHeight: 420, title: this.priv ? 'Lull Private' : 'Lull',
      backgroundColor: this.priv ? '#211C2E' : '#E9EDED', autoHideMenuBar: true
    };
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && !opts.offset) { winOpts.x = saved.x; winOpts.y = saved.y; }
    if (IS_MAC) { winOpts.titleBarStyle = 'hiddenInset'; winOpts.trafficLightPosition = { x: 16, y: 16 }; }
    else winOpts.icon = path.join(ROOT, 'assets', 'icon.png');
    this.win = new BaseWindow(winOpts);
    if (!IS_MAC && this.win.setMenuBarVisibility) this.win.setMenuBarVisibility(false);
    if (saved && saved.maximized && !this.priv) this.win.maximize();

    this.ui = new WebContentsView({ webPreferences: { preload: path.join(ROOT, 'preload', 'ui.js'), contextIsolation: true, sandbox: true, spellcheck: false } });
    this.ui.setBackgroundColor('#00000000');
    this.win.contentView.addChildView(this.ui);
    this.ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.ui.webContents.on('will-navigate', (e) => e.preventDefault());
    this.ui.webContents.loadFile(path.join(ROOT, 'ui', 'index.html'), { query: this.priv ? { private: '1' } : {} });

    this.tabs = new Map();
    this.order = [];
    this.current = '';
    this.spec = { dock: 280, overlay: null, screen: true };
    this.glance = null;
    this.fullscreenTab = null;
    this.wasFull = false;
    this.pendingUrls = opts.urls || [];
    this.uiReady = false;

    const relayout = () => this.layout();
    ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore'].forEach((ev) => this.win.on(ev, relayout));
    ['minimize', 'hide'].forEach((ev) => this.win.on(ev, () => this.emit('visible', { v: false })));
    ['restore', 'show', 'focus'].forEach((ev) => this.win.on(ev, () => this.emit('visible', { v: true })));
    this.win.on('focus', () => { LullWindow.last = this; });
    this.win.on('close', () => {
      if (this.priv) return;
      const b = this.win.getNormalBounds ? this.win.getNormalBounds() : this.win.getBounds();
      store.set('window', { x: b.x, y: b.y, width: b.width, height: b.height, maximized: this.win.isMaximized() });
    });
    this.win.on('closed', () => this.destroy());
    windows.add(this);
    LullWindow.last = this;
    this.layout();
  }

  emit(type, data) {
    const wc = this.ui && this.ui.webContents;
    if (wc && !wc.isDestroyed()) wc.send('lull:ev', type, data);
  }

  size() { const [w, h] = this.win.getContentSize(); return { w, h }; }

  layout() {
    if (this.win.isDestroyed()) return;
    const { w, h } = this.size();
    const S = this.spec || {};
    const cur = this.tabs.get(this.current);
    if (this.fullscreenTab && cur && this.fullscreenTab === this.current) {
      cur.view.setVisible(true);
      cur.view.setBounds({ x: 0, y: 0, width: w, height: h });
      if (cur.view.setBorderRadius) cur.view.setBorderRadius(0);
      this.ui.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    const dock = Math.max(0, Math.min(Math.round(S.dock || 0), w - 200));
    const m = dock > 0 ? 8 : 0;
    const page = { x: dock, y: m, width: Math.max(1, w - dock - m), height: Math.max(1, h - 2 * m) };
    for (const [id, t] of this.tabs) {
      const show = id === this.current && !S.screen;
      if (show) {
        t.view.setBounds(page);
        if (t.view.setBorderRadius) t.view.setBorderRadius(m ? 10 : 0);
      }
      if (t.view.getVisible() !== show) t.view.setVisible(show);
    }
    let ub;
    if (S.screen || S.overlay === 'full') ub = { x: 0, y: 0, width: w, height: h };
    else if (S.overlay && typeof S.overlay === 'object') ub = { x: 0, y: 0, width: Math.min(w, Math.max(dock, Math.round(S.overlay.w || 0))), height: h };
    else ub = { x: 0, y: 0, width: Math.max(dock, 6), height: h };
    this.ui.setBounds(ub);
    if (IS_MAC && this.win.setWindowButtonVisibility) this.win.setWindowButtonVisibility(dock > 0 || !!S.overlay || !!S.screen);
    if (this.glance) this.glance.view.setVisible(S.overlay === 'full');
  }

  /* ----- tabs ----- */
  ensureTab(id, url) {
    let t = this.tabs.get(id);
    if (!t) {
      const view = new WebContentsView({ webPreferences: { session: this.ses, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true, spellcheck: true } });
      view.setBackgroundColor('#FFFFFF');
      view.setVisible(false);
      this.win.contentView.addChildView(view, 0);
      t = { id, view, wc: view.webContents, lastInput: 0, lastUserNav: Date.now(), muted: false };
      this.tabs.set(id, t);
      this.setup(t);
      if (url) t.wc.loadURL(url).catch(() => { /* shown by the page itself */ });
      this.order.push(id);
      this.evict();
    }
    return t;
  }

  touch(id) { this.order = this.order.filter((x) => x !== id); this.order.push(id); }

  evict() {
    while (this.tabs.size > MAX_LIVE) {
      const victim = this.order.find((id) => id !== this.current && !media.isPlaying(this.tabs.get(id)));
      if (!victim) break;
      this.closeTab(victim);
      this.emit('evicted', { tab: victim });
    }
  }

  show(id, url) {
    const prev = this.tabs.get(this.current);
    this.current = id || '';
    if (prev && prev.id !== this.current && settings.autoPip) media.autoPip(prev);
    if (this.current) {
      const t = this.ensureTab(this.current, url);
      this.touch(this.current);
      media.exitPip(t);
      this.layout();
      if (!this.spec.screen && !this.spec.overlay) t.wc.focus();
      this.pageEvent(t);
    } else this.layout();
  }

  open(id, url) {
    const t = this.ensureTab(id);
    t.lastUserNav = Date.now();
    this.current = id;
    this.touch(id);
    t.wc.loadURL(url).catch(() => { /* error page */ });
    this.layout();
    t.wc.focus();
  }

  closeTab(id) {
    const t = this.tabs.get(id);
    if (!t) return;
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    byContents.delete(t.wc.id);
    media.forget(t);
    try { this.win.contentView.removeChildView(t.view); } catch (e) { /* gone */ }
    if (!t.wc.isDestroyed()) t.wc.close();
    if (this.current === id) this.current = '';
  }

  nav(id, what) {
    const t = id === 'glance' ? this.glance : this.tabs.get(id);
    if (!t || t.wc.isDestroyed()) return;
    t.lastUserNav = Date.now();
    const h = t.wc.navigationHistory;
    if (what === 'back' && h.canGoBack()) h.goBack();
    else if (what === 'forward' && h.canGoForward()) h.goForward();
    else if (what === 'reload') t.wc.reload();
    else if (what === 'hard-reload') t.wc.reloadIgnoringCache();
    else if (what === 'stop') t.wc.stop();
  }

  pageEvent(t, extra) {
    const wc = t.wc;
    if (wc.isDestroyed()) return;
    const h = wc.navigationHistory;
    const data = Object.assign({ tab: t.id, url: wc.getURL(), title: wc.getTitle(), canBack: h.canGoBack(), canFwd: h.canGoForward(), loading: wc.isLoading(), zoom: Math.round(wc.getZoomFactor() * 100) }, extra || {});
    this.emit('page', data);
    if (t.id === this.current && data.title) this.win.setTitle(data.title + (this.priv ? ' · Lull Private' : ' · Lull'));
  }

  setup(t) {
    const wc = t.wc;
    const owner = this;
    byContents.set(wc.id, { owner, tab: t.id });
    wc.on('input-event', (_e, input) => {
      const k = input.type;
      if (k === 'mouseDown' || k === 'keyDown' || k === 'rawKeyDown' || k === 'gestureTap' || k === 'touchStart') t.lastInput = Date.now();
    });
    wc.setWindowOpenHandler((d) => owner.handleOpen(t, d));
    wc.on('will-navigate', (e) => owner.guard(t, e));
    wc.on('did-start-navigation', (d) => {
      if (d.isMainFrame && !d.isSameDocument) { owner.emit('blocked', { tab: t.id, n: 0, reset: true }); owner.pageEvent(t, { url: d.url, loading: true, started: true }); }
    });
    ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-stop-loading', 'did-start-loading'].forEach((ev) => wc.on(ev, () => owner.pageEvent(t)));
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) owner.emit('failed', { tab: t.id, code, desc, url }); });
    wc.on('page-favicon-updated', (_e, icons) => { if (icons && icons[0]) owner.emit('icon', { tab: t.id, host: bare(hostOf(wc.getURL())), url: icons[0] }); });
    wc.on('enter-html-full-screen', () => { owner.fullscreenTab = t.id; owner.wasFull = owner.win.isFullScreen(); owner.win.setFullScreen(true); owner.layout(); });
    wc.on('leave-html-full-screen', () => { owner.fullscreenTab = null; if (!owner.wasFull) owner.win.setFullScreen(false); owner.layout(); });
    wc.on('context-menu', (_e, p) => owner.contextMenu(t, p));
    wc.on('found-in-page', (_e, r) => owner.emit('found', { tab: t.id, active: r.activeMatchOrdinal, matches: r.matches }));
    wc.on('render-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') owner.emit('crashed', { tab: t.id }); });
    wc.on('zoom-changed', (_e, dir) => owner.zoom(t.id, dir === 'in' ? 1 : -1));
    media.track(owner, t);
  }

  handleOpen(t, d) {
    const url = d.url || '';
    const from = t.wc.getURL();
    const guard = settings.popups !== false && !allowed(hostOf(from));
    const gesture = Date.now() - t.lastInput < 1500;
    if (!/^https?:/i.test(url)) {
      if (/^(mailto|tel|sms):/i.test(url) && gesture) shell.openExternal(url).catch(() => {});
      else if (guard && url && !/^about:blank/i.test(url)) this.emit('stopped', { tab: t.id, kind: 'popup', url });
      else if (guard) this.emit('stopped', { tab: t.id, kind: 'popup', url: '' });
      return { action: 'deny' };
    }
    if (guard && (!gesture || blocker.isListed(url, from))) {
      this.emit('stopped', { tab: t.id, kind: 'popup', url });
      return { action: 'deny' };
    }
    // Sign-in windows (opened with a size) need to talk back to the page, so they stay real pop-ups.
    if (d.disposition === 'new-window' && d.features && /width|height|popup/i.test(d.features)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, parent: undefined, webPreferences: { session: this.ses, sandbox: true, contextIsolation: true } }
      };
    }
    this.emit('newtab', { url, background: d.disposition === 'background-tab', from: t.id });
    return { action: 'deny' };
  }

  guard(t, e) {
    if (e.isMainFrame === false) return;
    const url = e.url || '';
    const l = url.toLowerCase();
    const now = Date.now();
    const from = hostOf(t.wc.getURL());
    const gesture = now - t.lastInput < 1500;
    if (!/^https?:/.test(l)) {
      if (/^(about|data|blob|javascript|chrome-error|devtools):/.test(l)) return;
      e.preventDefault();
      if (gesture) shell.openExternal(url).catch(() => {});
      else if (settings.redirects !== false) this.emit('stopped', { tab: t.id, kind: 'redirect', url });
      return;
    }
    if (settings.redirects === false || !from || allowed(from)) { t.lastUserNav = now; return; }
    const to = hostOf(url);
    if (siteOf(to) === siteOf(from)) return;
    if (gesture || now - t.lastUserNav < 2500) { t.lastUserNav = now; return; }
    e.preventDefault();
    this.emit('stopped', { tab: t.id, kind: 'redirect', url });
  }

  contextMenu(t, p) {
    const wc = t.wc;
    const items = [];
    const sep = { type: 'separator' };
    const search = (q) => (SEARCH[settings.engine] || SEARCH.ddg) + encodeURIComponent(q);
    if (p.dictionarySuggestions && p.dictionarySuggestions.length) {
      p.dictionarySuggestions.slice(0, 5).forEach((s) => items.push({ label: s, click: () => wc.replaceMisspelling(s) }));
      items.push(sep);
    }
    if (p.linkURL) {
      items.push({ label: 'Open link in new tab', click: () => this.emit('newtab', { url: p.linkURL, background: true, from: t.id }) });
      items.push({ label: 'Glance at link', click: () => this.emit('glance', { url: p.linkURL }) });
      if (!this.priv) items.push({ label: 'Open link in private window', click: () => openPrivate(p.linkURL) });
      items.push({ label: 'Copy link', click: () => clipboard.writeText(p.linkURL) }, sep);
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push({ label: 'Open image in new tab', click: () => this.emit('newtab', { url: p.srcURL, background: true, from: t.id }) });
      items.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ label: 'Save image', click: () => wc.downloadURL(p.srcURL) }, sep);
    }
    if (p.mediaType === 'video' || p.mediaType === 'audio') {
      if (p.mediaType === 'video') items.push({ label: 'Pop out video', click: () => media.popOut(this, t) });
      else items.push({ label: 'Open mini player', click: () => media.popOut(this, t) });
      items.push(sep);
    }
    if (p.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, sep, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, sep);
    } else if (p.selectionText) {
      const q = p.selectionText.trim().replace(/\s+/g, ' ');
      items.push({ role: 'copy' }, { label: 'Search for “' + (q.length > 24 ? q.slice(0, 24) + '…' : q) + '”', click: () => this.emit('newtab', { url: search(q), from: t.id }) }, sep);
    }
    if (!p.linkURL && !p.isEditable && !p.selectionText && p.mediaType === 'none') {
      const h = wc.navigationHistory;
      items.push({ label: 'Back', enabled: h.canGoBack(), click: () => this.nav(t.id, 'back') });
      items.push({ label: 'Forward', enabled: h.canGoForward(), click: () => this.nav(t.id, 'forward') });
      items.push({ label: 'Reload', click: () => this.nav(t.id, 'reload') }, sep);
      items.push({ label: 'Reader view', click: () => this.emit('shortcut', { name: 'reader' }) });
      items.push({ label: 'Find in page…', click: () => this.emit('shortcut', { name: 'find' }) }, sep);
    }
    items.push({ label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    Menu.buildFromTemplate(items).popup({ window: this.win });
  }

  zoom(id, dir) {
    const t = this.tabs.get(id || this.current);
    if (!t) return;
    const steps = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const z = t.wc.getZoomFactor();
    let i = steps.findIndex((s) => s >= z - 0.001);
    if (i < 0) i = steps.length - 1;
    const next = dir === 0 ? 1 : steps[Math.max(0, Math.min(steps.length - 1, i + dir))];
    t.wc.setZoomFactor(next);
    this.pageEvent(t);
  }

  /* ----- glance ----- */
  openGlance(url, rect) {
    if (!this.glance) {
      const view = new WebContentsView({ webPreferences: { session: this.ses, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true } });
      view.setBackgroundColor('#FFFFFF');
      if (view.setBorderRadius) view.setBorderRadius(14);
      this.win.contentView.addChildView(view);
      const g = { id: 'glance', view, wc: view.webContents, lastInput: 0, lastUserNav: Date.now() };
      this.glance = g;
      this.setup(g);
      g.wc.loadURL(url).catch(() => {});
    }
    if (rect) this.glance.view.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.w), height: Math.round(rect.h) });
    this.glance.view.setVisible(true);
  }

  closeGlance() {
    const g = this.glance;
    if (!g) return '';
    this.glance = null;
    const url = g.wc.isDestroyed() ? '' : g.wc.getURL();
    byContents.delete(g.wc.id);
    media.forget(g);
    try { this.win.contentView.removeChildView(g.view); } catch (e) { /* gone */ }
    if (!g.wc.isDestroyed()) g.wc.close();
    return url;
  }

  destroy() {
    for (const id of Array.from(this.tabs.keys())) this.closeTab(id);
    this.closeGlance();
    if (!this.ui.webContents.isDestroyed()) this.ui.webContents.close();
    windows.delete(this);
    if (LullWindow.last === this) LullWindow.last = Array.from(windows).pop() || null;
    if (this.priv) {
      const s = this.ses;
      s.clearStorageData().catch(() => {}).finally(() => { s.clearCache().catch(() => {}); blocker.removeSession(s); });
    }
  }
}
LullWindow.last = null;

function openPrivate(url) {
  const w = new LullWindow({ private: true, offset: true, urls: url ? [url] : [] });
  w.win.focus();
  return w;
}

function ownerOfUi(sender) {
  for (const w of windows) if (w.ui.webContents === sender) return w;
  return null;
}

function focused() {
  const bw = BaseWindow.getFocusedWindow();
  for (const w of windows) if (w.win === bw) return w;
  return LullWindow.last && !LullWindow.last.win.isDestroyed() ? LullWindow.last : Array.from(windows)[0] || null;
}

function mainWindow() {
  return Array.from(windows).find((w) => !w.priv) || null;
}

/* ---------------- IPC from the interface ---------------- */
function on(channel, fn) {
  ipcMain.on(channel, (e, ...args) => { const w = ownerOfUi(e.sender); if (w) fn(w, ...args); });
}

ipcMain.handle('lull:info', (e) => {
  const w = ownerOfUi(e.sender);
  return { platform: process.platform, version: app.getVersion(), private: !!(w && w.priv), dark: nativeTheme.shouldUseDarkColors };
});
ipcMain.handle('lull:state', () => JSON.stringify(store.get('ui', null)));
ipcMain.handle('lull:glance-url', (e) => { const w = ownerOfUi(e.sender); return w && w.glance && !w.glance.wc.isDestroyed() ? w.glance.wc.getURL() : ''; });
on('lull:save', (w, json) => { if (!w.priv) { try { store.set('ui', JSON.parse(json)); } catch (err) { /* ignore */ } } });
on('lull:ready', (w) => {
  w.uiReady = true;
  w.emit('visible', { v: true });
  (w.pendingUrls || []).forEach((u) => w.emit('openurl', { url: u }));
  w.pendingUrls = [];
});
on('lull:layout', (w, spec) => { w.spec = spec || w.spec; w.layout(); });
on('lull:show', (w, id, url) => w.show(id, url));
on('lull:open', (w, id, url) => w.open(id, url));
on('lull:close', (w, id) => w.closeTab(id));
on('lull:nav', (w, id, what) => w.nav(id, what));
on('lull:zoom', (w, id, dir) => w.zoom(id, dir));
on('lull:glance-open', (w, url, rect) => w.openGlance(url, rect));
on('lull:glance-close', (w) => w.closeGlance());
on('lull:settings', (w, s) => applySettings(s));
on('lull:private', (w, url) => openPrivate(url));
on('lull:close-window', (w) => w.win.close());
on('lull:theme', (w, t) => {
  if (t && t.bg) w.win.setBackgroundColor(t.bg);
  if (t && t.source && !w.priv) nativeTheme.themeSource = t.source;
});
on('lull:reader', (w, id) => {
  const t = w.tabs.get(id);
  if (!t) return;
  t.wc.executeJavaScript(READER).then((r) => w.emit('reader', { tab: id, result: String(r || 'none') })).catch(() => w.emit('reader', { tab: id, result: 'none' }));
});
on('lull:reader-size', (w, id, px) => { const t = w.tabs.get(id); if (t) t.wc.executeJavaScript("document.documentElement.style.setProperty('--rs','" + Number(px) + "px')").catch(() => {}); });
on('lull:find', (w, id, text, opts) => { const t = w.tabs.get(id); if (t && text) t.wc.findInPage(String(text), opts || {}); });
on('lull:find-stop', (w, id) => { const t = w.tabs.get(id); if (t) t.wc.stopFindInPage('clearSelection'); });
on('lull:media', (w, id, what) => {
  const t = w.tabs.get(id);
  if (!t) return;
  if (what === 'toggle') media.toggle(t);
  else if (what === 'popout') media.popOut(w, t);
  else if (what === 'mute' || what === 'unmute') { t.muted = what === 'mute'; t.wc.setAudioMuted(t.muted); media.update(w, t, {}); }
});
on('lull:copy', (w, text) => clipboard.writeText(String(text || '')));
on('lull:show-download', (w, p) => { if (p) shell.showItemInFolder(p); });
on('lull:devtools', (w, id) => { const t = w.tabs.get(id); if (t) t.wc.openDevTools({ mode: 'detach' }); });
on('lull:clear-data', (w) => {
  w.ses.clearStorageData().catch(() => {});
  w.ses.clearCache().catch(() => {});
  for (const t of w.tabs.values()) t.wc.navigationHistory.clear();
});
on('lull:external', (w, url) => { if (/^https?:/.test(url)) shell.openExternal(url).catch(() => {}); });
on('lull:default-browser', () => {
  app.setAsDefaultProtocolClient('http');
  app.setAsDefaultProtocolClient('https');
  if (process.platform === 'win32') shell.openExternal('ms-settings:defaultapps').catch(() => {});
});

// Pages: Alt-click a link (Glance) and per-frame settings for the page preload.
ipcMain.on('lull:glance', (e, url) => {
  const own = byContents.get(e.sender.id);
  if (!own || !/^https?:/i.test(url)) return;
  if (own.tab === 'glance' && own.owner.glance) own.owner.glance.wc.loadURL(url).catch(() => {});
  else own.owner.emit('glance', { url });
});
ipcMain.on('lull:page-config', (e, href) => {
  const h = hostOf(href);
  let top = h;
  try { top = hostOf(e.sender.getURL()) || h; } catch (err) { /* frame gone */ }
  const off = allowed(top);
  e.returnValue = { youtube: settings.youtube !== false && isYouTube(h) && !off, cookies: settings.cookies !== false && !off, glance: true };
});

blocker.onBlocked((wcId) => {
  const own = byContents.get(wcId);
  if (own) own.owner.emit('blocked', { tab: own.tab, inc: 1 });
});

module.exports = { LullWindow, windows, openPrivate, focused, mainWindow, settings: () => settings, applySettings, SEARCH };
