"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import DesktopShell from "@/components/layout/DesktopShell";
import { type Message, useKai } from "@/components/kai/use-kai";

export interface ChatViewer {
  name: string;
  email: string | null;
  isGuest: boolean;
}

interface KaiChatProps {
  viewer: ChatViewer;
  mode: "live" | "preview";
  liveModelLabel?: string | null;
  onSignOut?: () => void | Promise<void>;
}

const STARTERS = [
  "Build my schedule from scratch",
  "I have a deadline coming up",
  "My week is a mess — help",
  "I'm a morning person, optimize for that",
];

function KaiLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="white" strokeOpacity="0.9" strokeWidth="1.2" />
      <path
        d="M5.5 5L8 8L5.5 11"
        stroke="white"
        strokeOpacity="0.9"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 5L11 8L9 11"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon({ active = false }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.75A1.75 1.75 0 0 1 8.75 3.5V7A1.75 1.75 0 0 1 5.25 7V3.5A1.75 1.75 0 0 1 7 1.75Z"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
      />
      <path
        d="M10.5 6.75A3.5 3.5 0 0 1 3.5 6.75"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M7 10.5V12.25"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.75 12.25H9.25"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function mergeDraftText(base: string, finalTranscript: string, interimTranscript = "") {
  const spoken = `${finalTranscript}${interimTranscript}`.trim();
  if (!spoken) {
    return base;
  }

  const trimmedBase = base.trimEnd();
  if (!trimmedBase) {
    return spoken;
  }

  const separator = trimmedBase.endsWith("\n") ? "" : " ";
  return `${trimmedBase}${separator}${spoken}`;
}

function mergeTranscriptSnapshot(previousSnapshot: string, nextSnapshot: string) {
  const previous = previousSnapshot.trim();
  const next = nextSnapshot.trim();

  if (!next) {
    return previous;
  }

  if (!previous) {
    return next;
  }

  if (next === previous) {
    return previous;
  }

  if (next.startsWith(previous)) {
    return next;
  }

  if (previous.startsWith(next) || previous.toLowerCase().includes(next.toLowerCase())) {
    return previous;
  }

  const maxOverlap = Math.min(previous.length, next.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousTail = previous.slice(-size).toLowerCase();
    const nextHead = next.slice(0, size).toLowerCase();

    if (previousTail === nextHead) {
      return `${previous} ${next.slice(size)}`.trim();
    }
  }

  return `${previous} ${next}`.trim();
}

function buildTranscriptPreview(committedTranscript: string, interimTranscript: string) {
  const committed = committedTranscript.trim();
  const interim = interimTranscript.trim();

  if (!interim) {
    return committed;
  }

  if (!committed) {
    return interim;
  }

  if (interim.startsWith(committed)) {
    return interim;
  }

  return mergeTranscriptSnapshot(committed, interim);
}

function mapBrowserSpeechError(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked for Verge. Allow mic access and try again.";
    case "audio-capture":
      return "No microphone was found for dictation.";
    case "no-speech":
      return "Kai did not catch any speech on that attempt.";
    case "network":
      return "Voice dictation had a network problem. Try again in a moment.";
    default:
      return "Voice dictation could not start cleanly. Try again.";
  }
}

function mapDesktopDictationError(code?: string | null, message?: string | null) {
  switch (code) {
    case "speech-denied":
      return "Speech recognition permission was denied for Verge.";
    case "speech-restricted":
      return "Speech recognition is restricted on this Mac.";
    case "microphone-denied":
      return "Microphone access was denied for Verge.";
    case "recognizer-missing":
      return "Speech recognition could not start for your current language.";
    case "speech-unavailable":
      return "Speech recognition is unavailable right now on this Mac.";
    case "speech-runtime":
      return message || "Desktop dictation stopped unexpectedly.";
    case "bootstrap":
    case "launch":
      return message || "Desktop dictation could not start cleanly.";
    default:
      return message || "Desktop dictation could not start cleanly.";
  }
}

function subscribeToDesktopBridge() {
  return () => {};
}

function getDesktopSnapshot() {
  return Boolean(window.electron?.isDesktop);
}

function subscribeToSpeechSupport() {
  return () => {};
}

function getSpeechSupportSnapshot() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 px-4 py-1 md:px-6">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/6">
        <KaiLogo size={14} />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-white/8 bg-white/[0.06] px-4 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40"
            style={{ animationDelay: `${index * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const bubbleStyle = !isUser ? { scrollbarWidth: "thin" as const } : undefined;

  return (
    <div className={`flex items-end gap-3 px-4 py-1.5 md:px-6 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser ? (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/6">
          <KaiLogo size={14} />
        </div>
      ) : null}

      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[72%] ${
          isUser
            ? "rounded-br-sm bg-white text-zinc-900 shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
            : "max-h-[28rem] overflow-y-auto rounded-bl-sm border border-white/8 bg-white/[0.06] text-white/90"
        }`}
        style={bubbleStyle}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export default function KaiChat({ viewer, mode, liveModelLabel, onSignOut }: KaiChatProps) {
  const { messages, isLoading, sendMessage, resetConversation } = useKai();
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [desktopDictationSupported, setDesktopDictationSupported] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const dictationBaseRef = useRef("");
  const dictatedTextRef = useRef("");
  const dictationInterimRef = useRef("");
  const keepDictationAliveRef = useRef(false);
  const suppressNextDictationCommitRef = useRef(false);
  const restartDictationTimerRef = useRef<number | null>(null);
  const isDesktop = useSyncExternalStore(subscribeToDesktopBridge, getDesktopSnapshot, () => false);
  const browserSpeechSupported = useSyncExternalStore(subscribeToSpeechSupport, getSpeechSupportSnapshot, () => false);
  const speechSupported = isDesktop ? desktopDictationSupported : browserSpeechSupported;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (restartDictationTimerRef.current) {
        window.clearTimeout(restartDictationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    function clearDictationRestart() {
      if (restartDictationTimerRef.current) {
        window.clearTimeout(restartDictationTimerRef.current);
        restartDictationTimerRef.current = null;
      }
    }

    function restartDesktopDictation() {
      if (!keepDictationAliveRef.current) {
        return;
      }

      clearDictationRestart();
      restartDictationTimerRef.current = window.setTimeout(() => {
        if (!keepDictationAliveRef.current) {
          return;
        }

        void window.electron?.dictation?.start?.({ language: navigator.language || "en-US" });
      }, 220);
    }

    let cancelled = false;
    window.electron?.dictation?.getState?.().then((snapshot) => {
      if (!cancelled && snapshot) {
        setDesktopDictationSupported(Boolean(snapshot.platformSupported));
        setIsListening(Boolean(snapshot.running));
      }
    });

    const unsubscribe = window.electron?.dictation?.onEvent?.((event) => {
      if (cancelled || !event) {
        return;
      }

      if (event.type === "start") {
        clearDictationRestart();
        setSpeechError(null);
        setIsListening(true);
        return;
      }

      if (event.type === "transcript") {
        const nextTranscript = event.text?.trim() || "";

        if (event.isFinal) {
          dictatedTextRef.current = mergeTranscriptSnapshot(dictatedTextRef.current, nextTranscript);
          dictationInterimRef.current = "";
          setInput(mergeDraftText(dictationBaseRef.current, "", dictatedTextRef.current));
          return;
        }

        dictationInterimRef.current = nextTranscript;
        setInput(
          mergeDraftText(
            dictationBaseRef.current,
            "",
            buildTranscriptPreview(dictatedTextRef.current, dictationInterimRef.current),
          ),
        );
        return;
      }

      if (event.type === "error") {
        if (keepDictationAliveRef.current && event.code === "speech-runtime") {
          setSpeechError(null);
          return;
        }

        setSpeechError(mapDesktopDictationError(event.code, event.message));
        return;
      }

      if (event.type === "end") {
        dictatedTextRef.current = mergeTranscriptSnapshot(dictatedTextRef.current, dictationInterimRef.current);
        const finalDraft = mergeDraftText(dictationBaseRef.current, "", dictatedTextRef.current);
        const shouldSuppressCommit = suppressNextDictationCommitRef.current;
        suppressNextDictationCommitRef.current = false;
        const shouldAutoRestart = keepDictationAliveRef.current && !shouldSuppressCommit;

        if (!shouldSuppressCommit) {
          setInput(finalDraft);
          dictationBaseRef.current = finalDraft;
        }

        dictatedTextRef.current = "";
        dictationInterimRef.current = "";

        if (shouldAutoRestart) {
          setIsListening(true);
          restartDesktopDictation();
          return;
        }

        setIsListening(false);
      }
    });

    return () => {
      cancelled = true;
      clearDictationRestart();
      unsubscribe?.();
    };
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      setSpeechError(null);
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      dictatedTextRef.current = `${dictatedTextRef.current}${finalTranscript}`.trim();
      const sessionTranscript = `${dictatedTextRef.current} ${interimTranscript}`.trim();
      setInput(mergeDraftText(dictationBaseRef.current, "", sessionTranscript));
    };

    recognition.onerror = (event) => {
      setSpeechError(mapBrowserSpeechError(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const finalDraft = mergeDraftText(dictationBaseRef.current, "", dictatedTextRef.current);
      const shouldSuppressCommit = suppressNextDictationCommitRef.current;
      suppressNextDictationCommitRef.current = false;

      if (!shouldSuppressCommit) {
        setInput(finalDraft);
        dictationBaseRef.current = finalDraft;
      }

      dictatedTextRef.current = "";
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [isDesktop]);

  const firstName = viewer.name.split(" ")[0] || viewer.email?.split("@")[0] || "there";

  function stopListening(options?: { preserveDraft?: boolean }) {
    keepDictationAliveRef.current = false;
    suppressNextDictationCommitRef.current = options?.preserveDraft === false;

    if (restartDictationTimerRef.current) {
      window.clearTimeout(restartDictationTimerRef.current);
      restartDictationTimerRef.current = null;
    }

    if (isDesktop) {
      void window.electron?.dictation?.stop?.();
      return;
    }

    recognitionRef.current?.stop();
  }

  function toggleListening() {
    if (!speechSupported || isLoading) {
      if (!speechSupported) {
        setSpeechError("Voice dictation is not available in this environment.");
      }
      return;
    }

    setSpeechError(null);

    if (isListening) {
      stopListening({ preserveDraft: true });
      return;
    }

    keepDictationAliveRef.current = isDesktop;
    suppressNextDictationCommitRef.current = false;
    dictationBaseRef.current = input;
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";

    if (isDesktop) {
      void window.electron?.dictation?.start?.({ language: navigator.language || "en-US" });
      return;
    }

    try {
      recognitionRef.current?.start();
    } catch {
      setSpeechError("Voice dictation could not start cleanly. Try again.");
    }
  }

  async function handleSend() {
    if (!input.trim() || isLoading) {
      return;
    }

    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    const text = input.trim();
    setInput("");
    setHasStarted(true);
    setSpeechError(null);
    dictationBaseRef.current = "";
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";
    await sendMessage(text);
  }

  async function handleStarter(text: string) {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    setHasStarted(true);
    setSpeechError(null);
    await sendMessage(text);
  }

  function handleReset() {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    resetConversation();
    setHasStarted(false);
    setInput("");
    setSpeechError(null);
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";
    dictationBaseRef.current = "";
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    setInput(event.target.value);
    dictationBaseRef.current = event.target.value;
    setSpeechError(null);
  }

  return (
    <DesktopShell
      badge={mode === "live" ? "Kai Live" : "Kai Preview"}
      title={mode === "live" ? "Verge desktop planner" : "Verge preview mode"}
      subtitle={
        mode === "live"
          ? "Talk through the week and Kai will shape a schedule inside the desktop shell."
          : "A live model provider is not configured, so Kai uses a safe fallback instead of breaking."
      }
      contentClassName="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]"
      actions={
        <>
          {hasStarted ? (
            <button
              onClick={handleReset}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              type="button"
            >
              New chat
            </button>
          ) : null}
          {onSignOut ? (
            <button
              onClick={() => void onSignOut()}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              type="button"
            >
              Sign out
            </button>
          ) : null}
        </>
      }
    >
      <section className="flex min-h-0 flex-col border-b border-white/8 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
              <KaiLogo size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Kai</p>
              <p className="text-xs text-white/45">
                {viewer.isGuest
                  ? mode === "live"
                    ? "Guest session • live model"
                    : "Guest session • preview fallback"
                  : viewer.email
                    ? `Signed in as ${viewer.email}`
                    : "Signed-in session"}
              </p>
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              mode === "live"
                ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border border-amber-300/20 bg-amber-300/10 text-amber-100"
            }`}
          >
            {mode === "live" ? "Live model" : "Preview fallback"}
          </span>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto py-4" style={{ scrollbarWidth: "thin" }}>
          {!hasStarted ? (
            <div className="flex h-full flex-col items-center justify-center gap-10 px-6 pb-16 text-center">
              <div className="space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/6">
                  <KaiLogo size={22} />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  Hey {firstName} — let&apos;s build the week.
                </h2>
                <p className="mx-auto max-w-xl text-sm leading-7 text-white/50 md:text-base">
                  Tell Kai what is fixed, what is urgent, when your energy is best, and what you
                  refuse to sacrifice. The shell is now set up for desktop use instead of a generic
                  webpage in a window.
                </p>
              </div>

              <div className="flex max-w-xl flex-wrap justify-center gap-2.5">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    onClick={() => void handleStarter(starter)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                    type="button"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 pb-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" ? <TypingIndicator /> : null}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="border-t border-white/8 px-4 pb-5 pt-4 md:px-6">
          <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-3 transition focus-within:border-white/20">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={hasStarted ? "Reply to Kai..." : "Tell Kai about your week..."}
              disabled={isLoading}
              className="max-h-[160px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/25 disabled:opacity-40"
            />
            <button
              onClick={toggleListening}
              disabled={isLoading || !speechSupported}
              aria-label={isListening ? "Stop voice dictation" : "Start voice dictation"}
              aria-pressed={isListening}
              className={`mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition ${
                isListening
                  ? "bg-orange-300 text-zinc-900 shadow-[0_0_0_8px_rgba(251,191,36,0.08)]"
                  : "border border-white/10 bg-white/[0.06] text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white"
              } disabled:cursor-default disabled:opacity-25`}
              type="button"
            >
              <MicIcon active={isListening} />
            </button>
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isLoading}
              className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-zinc-900 transition hover:bg-white/90 disabled:cursor-default disabled:opacity-25"
              aria-label="Send"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 12V2M7 2L3 6M7 2L11 6"
                  stroke="#18181b"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p
            className={`mt-3 text-center text-[11px] ${
              speechError ? "text-amber-200/80" : isListening ? "text-orange-100/80" : "text-white/18"
            }`}
          >
            {speechError
              ? speechError
              : isListening
                ? "Listening now. Verge is adding your words into the draft."
                : speechSupported
                  ? "Tap the mic to speak into the draft. Kai still plans around energy, buffers, and deadlines instead of treating the calendar like a wall of equal blocks."
                  : "Kai plans around energy, buffers, and deadlines instead of treating the calendar like a wall of equal blocks."}
          </p>
        </footer>
      </section>

      <aside className="flex flex-col gap-4 border-t border-white/8 p-4 lg:border-t-0 lg:p-5">
        <InfoCard
          title={mode === "live" ? "Live planner route" : "Preview route"}
          copy={
            mode === "live"
              ? `${liveModelLabel || "A live model"} is enabled. If the provider fails, the route now falls back cleanly instead of crashing the UI.`
              : "This mode keeps the desktop app explorable even before Supabase or a live model provider are wired in."
          }
        />
        <InfoCard
          title="What Kai collects"
          copy="Fixed commitments, deadlines, sleep rhythm, best focus window, and the things you refuse to sacrifice."
        />
        <InfoCard
          title="Desktop shell"
          copy="Frameless window, glass surface, and window controls are now managed in the Electron layer instead of being hardcoded browser assumptions."
        />
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Starter prompts</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.slice(0, 3).map((starter) => (
              <button
                key={starter}
                onClick={() => void handleStarter(starter)}
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white/65 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                type="button"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </DesktopShell>
  );
}

function InfoCard({ title, copy }: { title: string; copy: string }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <strong className="text-sm text-white">{title}</strong>
      <p className="mt-2 text-sm leading-6 text-white/55">{copy}</p>
    </article>
  );
}
