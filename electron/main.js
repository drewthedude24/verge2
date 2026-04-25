const { app, BrowserWindow, Menu, ipcMain, screen, session, shell } = require("electron");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

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

const dictationState = {
  process: null,
  compilerPromise: null,
  stopTimer: null,
  didEmitEnd: false,
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

function getDictationSnapshot() {
  return {
    running: Boolean(dictationState.process),
    platformSupported: process.platform === "darwin",
  };
}

function emitToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function emitWindowState() {
  emitToRenderer("window:state-changed", getWindowSnapshot());
}

function emitDictationEvent(event) {
  if (event?.type === "end") {
    dictationState.didEmitEnd = true;
  }
  emitToRenderer("dictation:event", event);
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

async function ensureMacDictationBinary() {
  if (process.platform !== "darwin") {
    throw new Error("Native desktop dictation is currently macOS-only.");
  }

  if (dictationState.compilerPromise) {
    return dictationState.compilerPromise;
  }

  dictationState.compilerPromise = (async () => {
    const sourcePath = path.join(__dirname, "macosDictation.swift");
    const binDir = path.join(app.getPath("userData"), "native-tools");
    const binaryPath = path.join(binDir, "verge-dictation");

    await fs.mkdir(binDir, { recursive: true });

    let shouldCompile = true;
    try {
      const [sourceStats, binaryStats] = await Promise.all([fs.stat(sourcePath), fs.stat(binaryPath)]);
      shouldCompile = sourceStats.mtimeMs > binaryStats.mtimeMs;
    } catch {
      shouldCompile = true;
    }

    if (!shouldCompile) {
      return binaryPath;
    }

    await runProcess("xcrun", [
      "swiftc",
      "-parse-as-library",
      "-O",
      "-framework",
      "AVFoundation",
      "-framework",
      "Speech",
      sourcePath,
      "-o",
      binaryPath,
    ]);

    return binaryPath;
  })();

  try {
    return await dictationState.compilerPromise;
  } finally {
    dictationState.compilerPromise = null;
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: os.homedir(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function cleanupDictationProcess(child) {
  if (dictationState.stopTimer) {
    clearTimeout(dictationState.stopTimer);
    dictationState.stopTimer = null;
  }

  if (dictationState.process === child) {
    dictationState.process = null;
  }
}

function stopNativeDictation() {
  const child = dictationState.process;
  if (!child) {
    return getDictationSnapshot();
  }

  try {
    child.stdin.write("\n");
  } catch {}

  if (dictationState.stopTimer) {
    clearTimeout(dictationState.stopTimer);
  }

  dictationState.stopTimer = setTimeout(() => {
    try {
      child.kill("SIGTERM");
    } catch {}
  }, 450);

  return getDictationSnapshot();
}

async function startNativeDictation(language) {
  stopNativeDictation();
  const binaryPath = await ensureMacDictationBinary();
  const locale = language || app.getLocale() || "en-US";

  const child = spawn(binaryPath, [locale], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  dictationState.process = child;
  dictationState.didEmitEnd = false;

  const output = readline.createInterface({
    input: child.stdout,
  });

  output.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      const event = JSON.parse(line);
      emitDictationEvent(event);
    } catch (error) {
      console.error("[Dictation] Failed to parse helper output:", error, line);
    }
  });

  child.stderr.on("data", (data) => {
    console.error("[Dictation helper]", data.toString());
  });

  child.on("exit", (_code, signal) => {
    output.close();
    cleanupDictationProcess(child);

    if (!dictationState.didEmitEnd) {
      emitDictationEvent({
        type: "end",
        signal,
      });
    }
  });

  child.on("error", (error) => {
    console.error("[Dictation] Failed to start helper:", error);
    emitDictationEvent({
      type: "error",
      code: "launch",
      message: error.message,
    });
    cleanupDictationProcess(child);
  });

  return getDictationSnapshot();
}

function wireIpc() {
  ipcMain.handle("window:get-state", () => getWindowSnapshot());
  ipcMain.handle("window:minimize", () => setWindowMode(true));
  ipcMain.handle("window:restore", () => setWindowMode(false));
  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });
  ipcMain.handle("window:toggle-always-on-top", () => {
    windowState.alwaysOnTop = !windowState.alwaysOnTop;
    mainWindow?.setAlwaysOnTop(windowState.alwaysOnTop, "screen-saver");
    emitWindowState();
    return getWindowSnapshot();
  });
  ipcMain.handle("dictation:get-state", () => getDictationSnapshot());
  ipcMain.handle("dictation:start", async (_event, options = {}) => {
    try {
      return await startNativeDictation(options.language);
    } catch (error) {
      emitDictationEvent({
        type: "error",
        code: "bootstrap",
        message: error instanceof Error ? error.message : "Failed to start desktop dictation.",
      });
      return getDictationSnapshot();
    }
  });
  ipcMain.handle("dictation:stop", () => stopNativeDictation());
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
  stopNativeDictation();
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopNativeDictation();
  if (nextServer) {
    nextServer.kill();
  }
});
