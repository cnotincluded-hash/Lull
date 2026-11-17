'use strict';
// Now playing, pop-out (picture-in-picture for video, a mini player window for audio),
// and keeping the computer awake while something is audible.
const path = require('path');
const { BrowserWindow, powerSaveBlocker, screen, ipcMain } = require('electron');

const state = new Map(); // webContents id -> { owner, t, playing, audible }
let blockerId = null;
let mini = null;
let target = null;

const PIP_ENTER = `(async () => {
  if (document.pictureInPictureElement) return 'already';
  const vs = Array.from(document.querySelectorAll('video'));
  const playing = vs.find((x) => !x.paused && x.readyState > 1);
  if (!playing && Array.from(document.querySelectorAll('audio')).some((a) => !a.paused)) return 'none';
  const v = playing || vs.find((x) => x.readyState > 1 && x.videoWidth > 0);
  if (!v) return 'none';
  try { v.disablePictureInPicture = false; await v.requestPictureInPicture(); return 'pip'; } catch (e) { return 'none'; }
})()`;
const PIP_TOGGLE = `(async () => {
  if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'exit'; }
  return ${PIP_ENTER};
})()`;
const PIP_EXIT = `(async () => { if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'exit'; } return 'none'; })()`;
const TOGGLE = `(() => {
  let m = window.__lullLast;
  const all = Array.from(document.querySelectorAll('video,audio'));
  if (!m || !document.contains(m)) m = all.find((x) => !x.paused) || all[0];
  if (!m) return 'none';
  window.__lullLast = m;
  if (m.paused) { m.play(); return 'play'; }
  m.pause(); return 'pause';
})()`;
const HAS_VIDEO = `(() => Array.from(document.querySelectorAll('video')).some((v) => !v.paused && v.readyState > 1 && v.videoWidth > 0))()`;

function frames(wc) {
  try { return wc.mainFrame.framesInSubtree; } catch (e) { return []; }
}

async function runInFrames(wc, code, wanted) {
  for (const f of frames(wc)) {
    try {
      const r = await f.executeJavaScript(code, true);
      if (wanted.includes(r)) return r;
    } catch (e) { /* cross-origin frame that's gone, or blocked */ }
  }
  return 'none';
}

function anyAudible() {
  for (const s of state.values()) if (s.playing && s.audible) return true;
  return false;
}

function update(owner, t, change) {
  const wc = t.wc;
  if (wc.isDestroyed()) return;
  const s = state.get(wc.id) || { owner, t, playing: false, audible: false };
  Object.assign(s, change);
  state.set(wc.id, s);
  if (t.id !== 'glance') owner.emit('media', { tab: t.id, playing: s.playing, audible: s.audible, muted: wc.isAudioMuted(), title: wc.getTitle(), url: wc.getURL() });
  const need = anyAudible();
  if (need && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension');
  if (!need && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
  if (target && target.t === t) sendMini();
}

function track(owner, t) {
  const wc = t.wc;
  wc.on('media-started-playing', () => { update(owner, t, { playing: true }); });
  wc.on('media-paused', () => update(owner, t, { playing: false }));
  wc.on('audio-state-changed', (e) => update(owner, t, { audible: !!(e && e.audible) }));
  wc.on('page-title-updated', () => { if (state.has(wc.id)) update(owner, t, {}); });
}

function forget(t) {
  try { state.delete(t.wc.id); } catch (e) { /* gone */ }
  if (target && target.t === t) { target = null; if (mini) mini.close(); }
  if (!anyAudible() && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
}

function isPlaying(t) {
  if (!t || t.wc.isDestroyed()) return false;
  const s = state.get(t.wc.id);
  return !!(s && s.playing);
}

function toggle(t) { return runInFrames(t.wc, TOGGLE, ['play', 'pause']); }

async function popOut(owner, t) {
  const r = await runInFrames(t.wc, PIP_TOGGLE, ['pip', 'exit', 'already']);
  if (r === 'none') openMini(owner, t);
}

async function autoPip(t) {
  if (!isPlaying(t)) return;
  const hasVideo = await runInFrames(t.wc, HAS_VIDEO, [true]);
  if (hasVideo === true) runInFrames(t.wc, PIP_ENTER, ['pip', 'already']);
}

function exitPip(t) { if (isPlaying(t)) runInFrames(t.wc, PIP_EXIT, ['exit']); }

/* ----- mini player (for audio, or video that can't pop out) ----- */
function openMini(owner, t) {
  target = { owner, t };
  if (!mini) {
    const wa = screen.getPrimaryDisplay().workArea;
    mini = new BrowserWindow({
      width: 380, height: 96, x: wa.x + wa.width - 400, y: wa.y + wa.height - 116,
      frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false,
      minimizable: false, maximizable: false, show: false, backgroundColor: '#1C1D22', title: 'Lull mini player',
      webPreferences: { preload: path.join(__dirname, '..', 'preload', 'mini.js'), sandbox: true, contextIsolation: true }
    });
    mini.setAlwaysOnTop(true, 'floating');
    mini.loadFile(path.join(__dirname, '..', 'ui', 'mini.html'));
    mini.once('ready-to-show', () => { mini.showInactive(); sendMini(); });
    mini.on('closed', () => { mini = null; });
  } else sendMini();
}

function sendMini() {
  if (!mini || !target || target.t.wc.isDestroyed()) return;
  const wc = target.t.wc;
  const s = state.get(wc.id) || {};
  let site = '';
  try { site = new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch (e) { /* none */ }
  mini.webContents.send('lull:mini-state', { title: wc.getTitle() || site, site, playing: !!s.playing, muted: wc.isAudioMuted() });
}

ipcMain.on('lull:mini', (e, what) => {
  if (!mini || e.sender !== mini.webContents) return;
  if (what === 'close') { mini.close(); return; }
  if (!target || target.t.wc.isDestroyed()) return;
  const { owner, t } = target;
  if (what === 'toggle') toggle(t);
  else if (what === 'mute') { t.muted = !t.wc.isAudioMuted(); t.wc.setAudioMuted(t.muted); update(owner, t, {}); }
  else if (what === 'back') {
    if (owner.win.isMinimized()) owner.win.restore();
    owner.win.show();
    owner.win.focus();
    owner.emit('select', { tab: t.id });
  }
});

module.exports = { track, update, forget, isPlaying, toggle, popOut, autoPip, exitPip };
