const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Dialogs
  pickJar: () => ipcRenderer.invoke('pick-jar'),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  pickUploadFiles: () => ipcRenderer.invoke('pick-upload-files'),

  // Server control
  serverStart: (opts) => ipcRenderer.invoke('server-start', opts),
  serverStop: () => ipcRenderer.invoke('server-stop'),
  serverKill: () => ipcRenderer.invoke('server-kill'),
  serverCommand: (command) => ipcRenderer.invoke('server-command', { command }),
  serverStatus: () => ipcRenderer.invoke('server-status'),

  // Server events
  onLog: (cb) => ipcRenderer.on('server-log', (_, data) => cb(data)),
  onStopped: (cb) => ipcRenderer.on('server-stopped', (_, data) => cb(data)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // File system
  fsList: (dir) => ipcRenderer.invoke('fs-list', { dir }),
  fsCopy: (sources, destDir) => ipcRenderer.invoke('fs-copy', { sources, destDir }),
  fsDelete: (filePath) => ipcRenderer.invoke('fs-delete', { filePath }),
  fsOpen: (filePath) => ipcRenderer.invoke('fs-open', { filePath }),
  fsReveal: (filePath) => ipcRenderer.invoke('fs-reveal', { filePath }),

  // Settings
  settingsLoad: () => ipcRenderer.invoke('settings-load'),
  settingsSave: (data) => ipcRenderer.invoke('settings-save', data),

  // Playit.gg
  playitStatus: () => ipcRenderer.invoke('playit-status'),
  playitInstall: () => ipcRenderer.invoke('playit-install'),
  playitStart: () => ipcRenderer.invoke('playit-start'),
  playitStop: () => ipcRenderer.invoke('playit-stop'),
  playitOpenBrowser: () => ipcRenderer.invoke('playit-open-browser'),
  onPlayitLog: (cb) => ipcRenderer.on('playit-log', (_, data) => cb(data)),
  onPlayitStopped: (cb) => ipcRenderer.on('playit-stopped', (_, data) => cb(data)),
});
