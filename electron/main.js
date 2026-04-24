const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const isDev = !app.isPackaged;
const NEXT_PORT = 3000;

let nextServer = null;

// ── Spawn the Next.js standalone server (production only) ────────────────────
function startNextServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "../.next/standalone/server.js");

    nextServer = spawn("node", [serverPath], {
      env: {
        ...process.env,
        PORT: String(NEXT_PORT),
        NODE_ENV: "production",
      },
      cwd: path.join(__dirname, "../.next/standalone"),
    });

    nextServer.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log("[Next.js]", msg);
      if (msg.includes("Ready") || msg.includes("started")) resolve();
    });

    nextServer.stderr.on("data", (data) => {
      console.error("[Next.js error]", data.toString());
    });

    nextServer.on("error", reject);

    // Fallback: poll until the server responds
    const poll = setInterval(() => {
      http.get(`http://localhost:${NEXT_PORT}`, () => {
        clearInterval(poll);
        resolve();
      }).on("error", () => {});
    }, 500);

    // Give up after 30 seconds
    setTimeout(() => {
      clearInterval(poll);
      reject(new Error("Next.js server timed out"));
    }, 30000);
  });
}

// ── Create the desktop window ────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0c0c0e",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
    icon: path.join(__dirname, "../public/icons/icon-512.png"),
  });

  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(`http://localhost:${NEXT_PORT}`);

  // Open DevTools so we can see console errors during development
  win.webContents.openDevTools({ mode: "detach" });

  win.once("ready-to-show", () => win.show());
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!isDev) {
    try {
      await startNextServer();
    } catch (err) {
      console.error("Failed to start Next.js server:", err);
      app.quit();
      return;
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (nextServer) nextServer.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextServer) nextServer.kill();
});
