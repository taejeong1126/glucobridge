const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('care', {
    login: () => ipcRenderer.invoke('login'),
    onLoginResult: (callback) => ipcRenderer.on('login-result', (_event, result) => callback(result)),
    getConfig: () => ipcRenderer.invoke('get-config'),
    copyConfigValue: (name) => ipcRenderer.invoke('copy-config-value', name)
});
