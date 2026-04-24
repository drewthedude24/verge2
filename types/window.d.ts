export {};

declare global {
  type VergeWindowState = {
    alwaysOnTop: boolean;
    compact: boolean;
  };

  interface Window {
    electron?: {
      platform: string;
      isDesktop: boolean;
      window?: {
        getState?: () => Promise<VergeWindowState>;
        minimize?: () => Promise<VergeWindowState>;
        restore?: () => Promise<VergeWindowState>;
        close?: () => Promise<void>;
        toggleAlwaysOnTop?: () => Promise<VergeWindowState>;
        onStateChange?: (callback: (snapshot: VergeWindowState) => void) => () => void;
      };
    };
  }
}
