'use strict';
const { app, Menu, BaseWindow } = require('electron');
const store = require('./store');
const blocker = require('./blocker');

const IS_MAC = process.platform === 'darwin';
app.setName('Lull');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function urlsFrom(argv) {
  return (argv || []).slice(1).filter((a) => /^https?:\/\//i.test(a) || /^file:\/\//i.test(a));
}

function start() {
  // Autoplay with sound waits for a click unless the user turned that off (takes effect on restart).
  const saved = store.get('settings', {});
  if (saved.autoplay !== false) app.commandLine.appendSwitch('autoplay-policy', 'document-user-activation-required');
  app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ lull\/\S+/i, '');

  const early = urlsFrom(process.argv);
  let W = null; // window module, loaded once the app is ready

  app.on('open-url', (e, url) => {
    e.preventDefault();
    if (!W) { early.push(url); return; }
    deliver([url]);
  });

  app.on('second-instance', (_e, argv) => deliver(urlsFrom(argv)));

  function deliver(urls) {
    let w = W.mainWindow();
    if (!w) w = new W.LullWindow({ urls });
    else {
      if (w.win.isMinimized()) w.win.restore();
      w.win.focus();
      urls.forEach((u) => (w.uiReady ? w.emit('openurl', { url: u }) : w.pendingUrls.push(u)));
    }
  }

  app.whenReady().then(async () => {
    W = require('./window');
    await blocker.init();
    buildMenu(W);
    new W.LullWindow({ urls: early });
    const refresh = () => blocker.refreshIfDue(W.settings().updateLists !== false);
    setTimeout(refresh, 15000);
    setInterval(refresh, 6 * 3600 * 1000);
  });

  app.on('activate', () => { if (W && !W.mainWindow()) new W.LullWindow(); });
  app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
  app.on('before-quit', () => store.flush());
}

function buildMenu(W) {
  const send = (name) => () => { const w = W.focused(); if (w) w.emit('shortcut', { name }); };
  const cur = (fn) => () => { const w = W.focused(); if (w && w.current) fn(w, w.current); };
  const template = [];
  if (IS_MAC) template.push({ role: 'appMenu' });
  template.push({
    label: 'File',
    submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: send('new-tab') },
      { label: 'New Private Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => W.openPrivate() },
      { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: send('reopen') },
      { label: 'Open Location…', accelerator: 'CmdOrCtrl+L', click: send('address') },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
      { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: () => { const w = W.focused(); if (w) w.win.close(); } },
      ...(IS_MAC ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Exit' }])
    ]
  });
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find in Page…', accelerator: 'CmdOrCtrl+F', click: send('find') },
      { label: 'Find Next', accelerator: 'CmdOrCtrl+G', click: send('find-next') },
      { label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G', click: send('find-prev') }
    ]
  });
  template.push({
    label: 'View',
    submenu: [
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: cur((w, id) => w.nav(id, 'reload')) },
      { label: 'Reload (F5)', accelerator: 'F5', visible: false, click: cur((w, id) => w.nav(id, 'reload')) },
      { label: 'Hard Reload', accelerator: 'CmdOrCtrl+Shift+R', click: cur((w, id) => w.nav(id, 'hard-reload')) },
      { type: 'separator' },
      { label: 'Pin or Hide Sidebar', accelerator: 'CmdOrCtrl+Shift+S', click: send('sidebar-pin') },
      { label: 'Minimise Sidebar', accelerator: 'CmdOrCtrl+Shift+M', click: send('sidebar-mini') },
      { label: 'Reader View', accelerator: 'CmdOrCtrl+Alt+R', click: send('reader') },
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: cur((w, id) => w.zoom(id, 1)) },
      { label: 'Zoom In (+)', accelerator: 'CmdOrCtrl+Plus', visible: false, click: cur((w, id) => w.zoom(id, 1)) },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: cur((w, id) => w.zoom(id, -1)) },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: cur((w, id) => w.zoom(id, 0)) },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { label: 'Developer Tools', accelerator: IS_MAC ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: cur((w, id) => { const t = w.tabs.get(id); if (t) t.wc.openDevTools({ mode: 'detach' }); }) }
    ]
  });
  template.push({
    label: 'Go',
    submenu: [
      { label: 'Back', accelerator: IS_MAC ? 'Cmd+[' : 'Alt+Left', click: cur((w, id) => w.nav(id, 'back')) },
      { label: 'Forward', accelerator: IS_MAC ? 'Cmd+]' : 'Alt+Right', click: cur((w, id) => w.nav(id, 'forward')) },
      { type: 'separator' },
      { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: send('next-tab') },
      { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: send('prev-tab') },
      { label: 'Next Space', accelerator: 'CmdOrCtrl+Alt+Right', click: send('next-space') },
      { label: 'Previous Space', accelerator: 'CmdOrCtrl+Alt+Left', click: send('prev-space') }
    ]
  });
  template.push({
    label: 'Media',
    submenu: [
      { label: 'Play or Pause', click: send('media-toggle') },
      { label: 'Pop Out Player', accelerator: 'CmdOrCtrl+Shift+P', click: send('media-popout') }
    ]
  });
  template.push(IS_MAC ? { role: 'windowMenu' } : { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] });
  template.push({ label: 'Help', submenu: [{ label: 'How to Use Lull', click: send('help') }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
