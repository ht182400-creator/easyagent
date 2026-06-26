/**
 * 最小化 preload — 暴露 simulateUpdate + onUpdateStatus + getUpdateStatus
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyAgent', {
  checkUpdate: () => ipcRenderer.invoke('simulate-update'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  simulateUpdate: () => ipcRenderer.invoke('simulate-update'),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),

  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});
