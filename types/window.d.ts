export {};

declare global {
  interface Window {
    electron?: {
      platform: string;
      isDesktop: boolean;
      window?: {
        getState?: () => Promise<{ alwaysOnTop: boolean }>;
        minimize?: () => Promise<void>;
        close?: () => Promise<void>;
        toggleAlwaysOnTop?: () => Promise<{ alwaysOnTop: boolean }>;
      };
    };
  }
}
