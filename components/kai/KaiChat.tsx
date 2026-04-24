"use client";

import { useEffect, useRef, useState } from "react";
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
            : "rounded-bl-sm border border-white/8 bg-white/[0.06] text-white/90"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export default function KaiChat({ viewer, mode, onSignOut }: KaiChatProps) {
  const { messages, isLoading, sendMessage, resetConversation } = useKai();
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [input]);

  const firstName = viewer.name.split(" ")[0] || viewer.email?.split("@")[0] || "there";

  async function handleSend() {
    if (!input.trim() || isLoading) {
      return;
    }

    const text = input.trim();
    setInput("");
    setHasStarted(true);
    await sendMessage(text);
  }

  async function handleStarter(text: string) {
    setHasStarted(true);
    await sendMessage(text);
  }

  function handleReset() {
    resetConversation();
    setHasStarted(false);
    setInput("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <DesktopShell
      badge={mode === "live" ? "Kai Live" : "Kai Preview"}
      title={mode === "live" ? "Verge desktop planner" : "Verge preview mode"}
      subtitle={
        mode === "live"
          ? "Talk through the week and Kai will shape a schedule inside the desktop shell."
          : "Gemini is not configured, so Kai uses a safe fallback instead of breaking."
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

        <main className="flex-1 overflow-y-auto py-4" style={{ scrollbarWidth: "thin" }}>
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
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasStarted ? "Reply to Kai..." : "Tell Kai about your week..."}
              disabled={isLoading}
              className="max-h-[160px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/25 disabled:opacity-40"
            />
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
          <p className="mt-3 text-center text-[11px] text-white/18">
            Kai plans around energy, buffers, and deadlines instead of treating the calendar like a
            wall of equal blocks.
          </p>
        </footer>
      </section>

      <aside className="flex flex-col gap-4 border-t border-white/8 p-4 lg:border-t-0 lg:p-5">
        <InfoCard
          title={mode === "live" ? "Live planner route" : "Preview route"}
          copy={
            mode === "live"
              ? "Gemini-backed chat is enabled. If the provider fails, the route now falls back cleanly instead of crashing the UI."
              : "This mode keeps the desktop app explorable even before Supabase or Gemini are wired in."
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
