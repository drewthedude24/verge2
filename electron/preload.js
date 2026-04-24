const { contextBridge } = require("electron");

// Expose a minimal, safe API surface to the renderer (Next.js frontend).
// Never expose ipcRenderer or Node APIs directly.
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,       // "darwin" | "win32" | "linux"
  isDesktop: true,                  // lets the app know it's running in Electron
});
