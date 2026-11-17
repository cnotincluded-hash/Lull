'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mini', {
  act: (what) => ipcRenderer.send('lull:mini', what),
  on: (fn) => ipcRenderer.on('lull:mini-state', (_e, s) => fn(s))
});
