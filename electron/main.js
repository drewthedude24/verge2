const { app, BrowserWindow, Menu, ipcMain, screen, session, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const isDev = !app.isPackaged;
const NEXT_PORT = 3000;
const NEXT_HOST = "localhost";
const FULL_WINDOW = {
  width: 1340,
  height: 860,
  minWidth: 980,
  minHeight: 680,
};
const COMPACT_WINDOW = {
  width: 580,
  height: 94,
  topInset: 14,
};
const windowState = {
  alwaysOnTop: true,
  compact: false,
  expandedBounds: null,
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
    compact: windowState.compact,
  };
}

function emitWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:state-changed", getWindowSnapshot());
  }
}

function rememberExpandedBounds() {
  if (!mainWindow || windowState.compact || mainWindow.isDestroyed()) {
    return;
  }

  windowState.expandedBounds = mainWindow.getBounds();
}

function getCompactBounds() {
  const anchorBounds =
    windowState.expandedBounds ||
    (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null) || {
      x: 0,
      y: 0,
      width: FULL_WINDOW.width,
      height: FULL_WINDOW.height,
    };
  const display = screen.getDisplayMatching(anchorBounds);
  const { x, y, width } = display.workArea;

  return {
    width: COMPACT_WINDOW.width,
    height: COMPACT_WINDOW.height,
    x: Math.round(x + (width - COMPACT_WINDOW.width) / 2),
    y: y + COMPACT_WINDOW.topInset,
  };
}

function setWindowMode(compact) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getWindowSnapshot();
  }

  if (compact === windowState.compact) {
    return getWindowSnapshot();
  }

  if (compact) {
    rememberExpandedBounds();
    windowState.compact = true;
    const bounds = getCompactBounds();

    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(COMPACT_WINDOW.width, COMPACT_WINDOW.height);
    mainWindow.setBounds(bounds, true);
    mainWindow.setAlwaysOnTop(windowState.alwaysOnTop, "screen-saver");
    mainWindow.show();
    mainWindow.focus();
  } else {
    windowState.compact = false;
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(FULL_WINDOW.minWidth, FULL_WINDOW.minHeight);

    if (windowState.expandedBounds) {
      mainWindow.setBounds(windowState.expandedBounds, true);
    } else {
      mainWindow.setSize(FULL_WINDOW.width, FULL_WINDOW.height, true);
      mainWindow.center();
    }

    mainWindow.setAlwaysOnTop(windowState.alwaysOnTop, "screen-saver");
    mainWindow.show();
    mainWindow.focus();
  }

  emitWindowState();
  return getWindowSnapshot();
}

function configureSessionPermissions() {
  const allowedOrigin = `http://${NEXT_HOST}:${NEXT_PORT}`;
  const allowedPermissions = new Set(["media", "microphone", "audioCapture"]);

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return requestingOrigin === allowedOrigin && allowedPermissions.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || "";
    const isAllowed = requestingUrl.startsWith(allowedOrigin) && allowedPermissions.has(permission);
    callback(isAllowed);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FULL_WINDOW.width,
    height: FULL_WINDOW.height,
    minWidth: FULL_WINDOW.minWidth,
    minHeight: FULL_WINDOW.minHeight,
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
    emitWindowState();
  });

  mainWindow.on("move", rememberExpandedBounds);
  mainWindow.on("resize", rememberExpandedBounds);
  mainWindow.on("minimize", (event) => {
    if (windowState.compact) {
      return;
    }

    event.preventDefault();
    setWindowMode(true);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function wireIpc() {
  ipcMain.handle("window:get-state", () => getWindowSnapshot());
  ipcMain.handle("window:minimize", () => {
    return setWindowMode(true);
  });
  ipcMain.handle("window:restore", () => {
    return setWindowMode(false);
  });
  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });
  ipcMain.handle("window:toggle-always-on-top", () => {
    windowState.alwaysOnTop = !windowState.alwaysOnTop;
    mainWindow?.setAlwaysOnTop(windowState.alwaysOnTop, "screen-saver");
    emitWindowState();
    return getWindowSnapshot();
  });
}

app.whenReady().then(async () => {
  configureSessionPermissions();
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
