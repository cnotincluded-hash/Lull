'use strict';
// Saves Lull's state (tabs, spaces, favourites, settings) as one JSON file in the user data folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'lull-state.json');
let cache = null;
let timer = null;

function load() {
  if (cache !== null) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (e) {
    if (fs.existsSync(file())) {
      try { fs.renameSync(file(), file() + '.unreadable-' + Date.now()); } catch (e2) { /* keep going */ }
    }
    cache = {};
  }
  return cache;
}

function writeNow() {
  clearTimeout(timer);
  timer = null;
  const tmp = file() + '.tmp';
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file());
  } catch (e) { console.error('Lull: could not save state', e); }
}

function save(next) {
  cache = next;
  clearTimeout(timer);
  timer = setTimeout(writeNow, 400);
}

function get(key, fallback) {
  const s = load();
  return s[key] === undefined ? fallback : s[key];
}

function set(key, value) {
  const s = load();
  s[key] = value;
  save(s);
}

function flush() { if (timer) writeNow(); }

module.exports = { load, save, get, set, flush };
