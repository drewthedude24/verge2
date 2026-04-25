const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isDesktop: true,
  window: {
    getState: () => ipcRenderer.invoke("window:get-state"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    restore: () => ipcRenderer.invoke("window:restore"),
    close: () => ipcRenderer.invoke("window:close"),
    toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggle-always-on-top"),
    onStateChange: (callback) => {
      const listener = (_event, snapshot) => callback(snapshot);
      ipcRenderer.on("window:state-changed", listener);
      return () => {
        ipcRenderer.removeListener("window:state-changed", listener);
      };
    },
  },
  dictation: {
    getState: () => ipcRenderer.invoke("dictation:get-state"),
    start: (options) => ipcRenderer.invoke("dictation:start", options),
    stop: () => ipcRenderer.invoke("dictation:stop"),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("dictation:event", listener);
      return () => {
        ipcRenderer.removeListener("dictation:event", listener);
      };
    },
  },
});
