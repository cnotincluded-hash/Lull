'use strict';
// Ad and tracker blocking: Ghostery's adblocker engine (EasyList, EasyPrivacy, uBlock Origin lists),
// shipped with the app and refreshed every few days from Ghostery's prebuilt lists.
const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');
const { ElectronBlocker, Request } = require('@ghostery/adblocker-electron');

// Ghostery registers two global IPC handlers per session it is enabled in. They don't depend on
// the session, so one registration serves every session (normal and private windows).
const origHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => { try { origHandle(channel, fn); } catch (e) { /* already registered */ } };

const sessions = new Set();
let engine = null;
let enabled = true;
let allow = [];
const listeners = { blocked: [] };
const REFRESH_DAYS = 3;

const userEngine = () => path.join(app.getPath('userData'), 'engine.bin');
function bundledEngine() {
  const candidates = [
    path.join(process.resourcesPath || '', 'engine', 'engine.bin'),
    path.join(__dirname, '..', 'engine', 'engine.bin')
  ];
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
}

function wire(e) {
  e.on('request-blocked', (req) => listeners.blocked.forEach((fn) => fn(req.tabId, req.url)));
  e.on('request-redirected', (req) => listeners.blocked.forEach((fn) => fn(req.tabId, req.url)));
  if (allow.length) e.updateFromDiff({ added: allow.map(allowFilter) });
  return e;
}

const allowFilter = (host) => '@@||' + host + '^$document';

function readEngine(p) {
  try { return ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(p))); } catch (e) { return null; }
}

async function init() {
  let e = null;
  const u = userEngine();
  const b = bundledEngine();
  // Prefer whichever copy is newer: the one shipped with this version, or the last download.
  let uTime = 0, bTime = 0;
  try { uTime = fs.statSync(u).mtimeMs; } catch (err) { /* none */ }
  try { bTime = b ? fs.statSync(b).mtimeMs : 0; } catch (err) { /* none */ }
  if (uTime && uTime >= bTime) e = readEngine(u);
  if (!e && b) e = readEngine(b);
  if (!e && uTime) e = readEngine(u);
  if (!e) {
    try { e = await download(); } catch (err) { console.error('Lull: block lists unavailable', err.message); }
  }
  if (e) {
    engine = wire(e);
    if (enabled) sessions.forEach((s) => engine.enableBlockingInSession(s));
  }
  return engine;
}

async function download() {
  const e = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  try { fs.writeFileSync(userEngine(), Buffer.from(e.serialize())); } catch (err) { /* keep in memory */ }
  return e;
}

async function refreshIfDue(allowed) {
  if (!allowed) return;
  let age = Infinity;
  try { age = (Date.now() - fs.statSync(userEngine()).mtimeMs) / 864e5; } catch (e) { /* never downloaded */ }
  const b = bundledEngine();
  if (b && age === Infinity) { try { age = (Date.now() - fs.statSync(b).mtimeMs) / 864e5; } catch (e) { /* ignore */ } }
  if (age < REFRESH_DAYS) return;
  try {
    const fresh = wire(await download());
    const old = engine;
    sessions.forEach((s) => { if (old) old.disableBlockingInSession(s); if (enabled) fresh.enableBlockingInSession(s); });
    engine = fresh;
  } catch (e) { console.error('Lull: list refresh failed', e.message); }
}

function addSession(s) {
  sessions.add(s);
  if (engine && enabled) engine.enableBlockingInSession(s);
}

function removeSession(s) {
  if (engine) { try { engine.disableBlockingInSession(s); } catch (e) { /* gone */ } }
  sessions.delete(s);
  // Ghostery's global handlers are removed with any session: put them back for the others.
  if (engine && enabled) sessions.forEach((x) => { engine.disableBlockingInSession(x); engine.enableBlockingInSession(x); });
}

function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  if (!engine) return;
  sessions.forEach((s) => (on ? engine.enableBlockingInSession(s) : engine.disableBlockingInSession(s)));
}

function setAllow(hosts) {
  const next = Array.from(new Set((hosts || []).filter(Boolean)));
  if (engine) {
    const removed = allow.filter((h) => !next.includes(h)).map(allowFilter);
    const added = next.filter((h) => !allow.includes(h)).map(allowFilter);
    if (removed.length || added.length) engine.updateFromDiff({ added, removed });
  }
  allow = next;
}

/** True if a top-level navigation or pop-up to this address would be blocked by the lists. */
function isListed(url, sourceUrl) {
  if (!engine || !enabled) return false;
  try {
    const r = Request.fromRawDetails({ url, sourceUrl: sourceUrl || url, type: 'sub_frame' });
    return engine.match(r).match === true;
  } catch (e) { return false; }
}

function onBlocked(fn) { listeners.blocked.push(fn); }

module.exports = { init, refreshIfDue, addSession, removeSession, setEnabled, setAllow, isListed, onBlocked };
