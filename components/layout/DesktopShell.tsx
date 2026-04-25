"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

type DesktopShellProps = {
  badge?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  contentClassName?: string;
  actions?: React.ReactNode;
};

type WindowState = {
  alwaysOnTop: boolean;
  compact: boolean;
};

type ElectronRegionStyle = CSSProperties & {
  WebkitAppRegion?: "drag" | "no-drag";
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function subscribeToDesktopShell() {
  return () => {};
}

function getDesktopSnapshot() {
  return Boolean(window.electron?.isDesktop);
}

const dragRegionStyle: ElectronRegionStyle = {
  WebkitAppRegion: "drag",
};

const noDragRegionStyle: ElectronRegionStyle = {
  WebkitAppRegion: "no-drag",
};

export default function DesktopShell({
  badge = "Verge",
  title,
  subtitle,
  children,
  contentClassName,
  actions,
}: DesktopShellProps) {
  const isDesktop = useSyncExternalStore(subscribeToDesktopShell, getDesktopSnapshot, () => false);
  const [windowState, setWindowState] = useState<WindowState>({ alwaysOnTop: true, compact: false });

  useEffect(() => {
    if (!window.electron?.window?.getState) {
      return;
    }

    let cancelled = false;
    const unsubscribe = window.electron.window.onStateChange?.((snapshot) => {
      if (!cancelled && snapshot) {
        setWindowState(snapshot);
      }
    });

    window.electron.window.getState().then((snapshot) => {
      if (!cancelled && snapshot) {
        setWindowState(snapshot);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const statusText = isDesktop
    ? windowState.compact
      ? "Compact bar active"
      : windowState.alwaysOnTop
      ? "Pinned above other apps"
      : "Floating with other windows"
    : "Browser preview";

  async function togglePin() {
    const snapshot = await window.electron?.window?.toggleAlwaysOnTop?.();
    if (snapshot) {
      setWindowState(snapshot);
    }
  }

  if (isDesktop && windowState.compact) {
    return (
      <main className="min-h-screen bg-transparent px-3 pt-3 text-white">
        <div
          className="mx-auto flex max-w-[620px] items-center justify-between gap-4 rounded-full border border-white/12 bg-[#0b0e13]/30 px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-3xl"
          style={dragRegionStyle}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span
                className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200"
                style={noDragRegionStyle}
              >
                {badge}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white/92">{title}</p>
                <p className="truncate text-xs text-white/45">{statusText}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2" style={noDragRegionStyle}>
            <button
              onClick={() => window.electron?.window?.restore?.()}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs text-white/75 transition hover:border-white/20 hover:bg-white/12 hover:text-white"
              type="button"
            >
              Open
            </button>
            <button
              onClick={togglePin}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs text-white/75 transition hover:border-white/20 hover:bg-white/12 hover:text-white"
              title={windowState.alwaysOnTop ? "Let Verge move behind other apps" : "Keep Verge above other apps across spaces"}
              type="button"
            >
              {windowState.alwaysOnTop ? "Pinned" : "Pin"}
            </button>
            <button
              onClick={() => window.electron?.window?.close?.()}
              className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-400/20"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(250,126,60,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.12),_transparent_24%)] p-3 text-white md:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1480px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0b0e13]/58 shadow-[0_32px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl md:min-h-[calc(100vh-32px)]">
        <header
          className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3 md:px-6"
          style={isDesktop ? dragRegionStyle : undefined}
        >
          <div className="flex items-center gap-4">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200">
              {badge}
            </span>
            <div>
              <h1 className="text-sm font-semibold tracking-[0.06em] text-white/92 md:text-base">{title}</h1>
              <p className="text-xs text-white/45 md:text-sm">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2" style={isDesktop ? noDragRegionStyle : undefined}>
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/55 md:inline-flex">
              {statusText}
            </span>

            {actions}

            {isDesktop ? (
              <>
                <button
                  onClick={togglePin}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  title={windowState.alwaysOnTop ? "Let Verge move behind other apps" : "Keep Verge above other apps across spaces"}
                  type="button"
                >
                  {windowState.alwaysOnTop ? "Pinned" : "Pin"}
                </button>
                <button
                  onClick={() => window.electron?.window?.minimize?.()}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  type="button"
                >
                  Minimize
                </button>
                <button
                  onClick={() => window.electron?.window?.close?.()}
                  className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-400/20"
                  type="button"
                >
                  Close
                </button>
              </>
            ) : null}
          </div>
        </header>

        <section className={joinClasses("flex-1 overflow-hidden", contentClassName)}>{children}</section>
      </div>
    </main>
  );
}
