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
});
