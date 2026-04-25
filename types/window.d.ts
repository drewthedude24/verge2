export {};

declare global {
  type VergeWindowState = {
    alwaysOnTop: boolean;
    compact: boolean;
  };

  type VergeDictationState = {
    running: boolean;
    platformSupported: boolean;
  };

  type VergeDictationEvent = {
    type: "start" | "transcript" | "error" | "end";
    sessionId?: number | null;
    text?: string | null;
    code?: string | null;
    message?: string | null;
    isFinal?: boolean | null;
    signal?: string | null;
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
      dictation?: {
        getState?: () => Promise<VergeDictationState>;
        start?: (options?: { language?: string }) => Promise<VergeDictationState>;
        stop?: () => Promise<VergeDictationState>;
        onEvent?: (callback: (event: VergeDictationEvent) => void) => () => void;
      };
    };
  }
}
