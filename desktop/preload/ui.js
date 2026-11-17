// Bridge for Lull's own interface (ui/index.html). Only "lull:" channels pass.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const ok = (c) => typeof c === 'string' && c.startsWith('lull:');
contextBridge.exposeInMainWorld('lull', {
  platform: process.platform,
  send: (c, ...a) => { if (ok(c)) ipcRenderer.send(c, ...a); },
  invoke: (c, ...a) => (ok(c) ? ipcRenderer.invoke(c, ...a) : Promise.reject(new Error('blocked'))),
  on: (fn) => { ipcRenderer.on('lull:ev', (_e, type, data) => fn(type, data)); }
});
