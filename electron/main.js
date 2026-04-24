const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const isDev = !app.isPackaged;
const NEXT_PORT = 3000;
const NEXT_HOST = "localhost";
const windowState = {
  alwaysOnTop: true,
};

let mainWindow = null;
let nextServer = null;

function startNextServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "../.next/standalone/server.js");
    const cwd = path.join(__dirname, "../.next/standalone");

    nextServer = spawn("node", [serverPath], {
      env: {
        ...process.env,
        PORT: String(NEXT_PORT),
        NODE_ENV: "production",
      },
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Next.js server timed out."));
      }
    }, 30_000);

    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    nextServer.stdout.on("data", (data) => {
      const message = data.toString();
      console.log("[Next.js]", message);
      if (message.includes("Ready") || message.includes("started")) {
        finish(resolve);
      }
    });

    nextServer.stderr.on("data", (data) => {
      console.error("[Next.js error]", data.toString());
    });

    nextServer.on("error", (error) => finish(() => reject(error)));

    const poll = setInterval(() => {
      http
        .get(`http://${NEXT_HOST}:${NEXT_PORT}`, () => {
          clearInterval(poll);
          finish(resolve);
        })
        .on("error", () => {});
    }, 400);

    nextServer.on("exit", (code) => {
      clearInterval(poll);
      if (!settled && code !== 0) {
        finish(() => reject(new Error(`Next.js server exited with code ${code ?? "unknown"}.`)));
      }
    });
  });
}

function getWindowSnapshot() {
  return {
    alwaysOnTop: windowState.alwaysOnTop,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    transparent: true,
    hasShadow: true,
    show: false,
    backgroundColor: "#00000000",
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, "../public/icons/icon-512.png"),
  });

  mainWindow.setAlwaysOnTop(windowState.alwaysOnTop, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://${NEXT_HOST}:${NEXT_PORT}`);

  if (isDev && process.env.OPEN_ELECTRON_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function wireIpc() {
  ipcMain.handle("window:get-state", () => getWindowSnapshot());
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });
  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });
  ipcMain.handle("window:toggle-always-on-top", () => {
    windowState.alwaysOnTop = !windowState.alwaysOnTop;
    mainWindow?.setAlwaysOnTop(windowState.alwaysOnTop, "screen-saver");
    return getWindowSnapshot();
  });
}

app.whenReady().then(async () => {
  wireIpc();

  if (!isDev) {
    try {
      await startNextServer();
    } catch (error) {
      console.error("Failed to start Next.js server:", error);
      app.quit();
      return;
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextServer) {
    nextServer.kill();
  }
});
