"use client";

// components/kai/KaiChat.tsx
// Full-screen Kai chat UI — designed to match Verge's dark minimal aesthetic.
// Drops in after auth. Pass the authenticated user from Supabase via props.

import { useEffect, useRef, useState } from "react";
import { useKai, Message } from "./use-kai";
import type { User } from "@supabase/supabase-js";

interface KaiChatProps {
  user: User;
  onSignOut: () => void;
}

// Typing indicator dots
function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 px-6 py-2">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
        <KaiLogo size={14} />
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-white/5 border border-white/8">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </div>
    </div>
  );
}

// Kai wordmark / logo mark
function KaiLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="white" strokeOpacity="0.9" strokeWidth="1.2" />
      <path d="M5.5 5L8 8L5.5 11" stroke="white" strokeOpacity="0.9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 5L11 8L9 11" stroke="white" strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Verge wordmark
function VergeLogo() {
  return (
    <span
      className="text-sm font-semibold tracking-[0.18em] text-white/80 uppercase select-none"
      style={{ fontFamily: "var(--font-geist-sans, 'Geist', sans-serif)", letterSpacing: "0.2em" }}
    >
      VERGE
    </span>
  );
}

// Individual message bubble
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  // Render schedule blocks with monospace styling
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const segments: React.ReactNode[] = [];
    let inSchedule = false;
    let scheduleLines: string[] = [];
    let key = 0;

    const flushSchedule = () => {
      if (scheduleLines.length > 0) {
        segments.push(
          <pre
            key={key++}
            className="mt-3 mb-2 text-xs leading-relaxed font-mono text-white/70 bg-white/4 border border-white/8 rounded-xl p-4 overflow-x-auto whitespace-pre"
          >
            {scheduleLines.join("\n")}
          </pre>
        );
        scheduleLines = [];
      }
    };

    for (const line of lines) {
      // Detect schedule day headers like "MONDAY", "TUESDAY" etc.
      const isDayHeader = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/i.test(line.trim());
      const isTimeBlock = /^\s+\d{2}:\d{2}/.test(line);

      if (isDayHeader || (inSchedule && isTimeBlock)) {
        inSchedule = true;
        scheduleLines.push(line);
      } else {
        if (inSchedule) {
          flushSchedule();
          inSchedule = false;
        }
        if (line.trim()) {
          segments.push(
            <p key={key++} className="leading-relaxed">
              {line}
            </p>
          );
        } else {
          segments.push(<br key={key++} />);
        }
      }
    }
    if (inSchedule) flushSchedule();
    return segments;
  };

  return (
    <div className={`flex items-end gap-3 px-6 py-1.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center mb-0.5">
          <KaiLogo size={14} />
        </div>
      )}

      {/* Bubble */}
      <div
        className={`
          max-w-[72%] px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? "bg-white text-zinc-900 rounded-2xl rounded-br-sm font-medium"
            : "bg-white/6 text-white/90 rounded-2xl rounded-bl-sm border border-white/8"
          }
          ${message.isStreaming ? "animate-pulse" : ""}
        `}
        style={{ fontFamily: "var(--font-geist-sans, 'Geist', sans-serif)" }}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="space-y-0.5">{renderContent(message.content)}</div>
        )}
      </div>
    </div>
  );
}

// Suggested starter prompts shown before first message
const STARTERS = [
  "Build my schedule from scratch",
  "I have a deadline coming up",
  "My week is a mess — help",
  "I'm a morning person, optimize for that",
];

export default function KaiChat({ user, onSignOut }: KaiChatProps) {
  const { messages, isLoading, sendMessage, resetConversation } = useKai();
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    setHasStarted(true);
    await sendMessage(text);
  };

  const handleStarter = async (text: string) => {
    setHasStarted(true);
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    resetConversation();
    setHasStarted(false);
    setInput("");
  };

  const firstName = user.user_metadata?.full_name?.split(" ")[0]
    ?? user.email?.split("@")[0]
    ?? "there";

  return (
    <div
      className="flex flex-col h-screen w-screen bg-zinc-950 text-white overflow-hidden"
      style={{ fontFamily: "var(--font-geist-sans, 'Geist', sans-serif)" }}
    >
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-white/6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <VergeLogo />
          <span className="text-white/20 text-xs">×</span>
          <div className="flex items-center gap-1.5">
            <KaiLogo size={12} />
            <span className="text-xs text-white/40 tracking-wide">Kai</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {hasStarted && (
            <button
              onClick={handleReset}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              New chat
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/50 font-medium">
              {firstName[0].toUpperCase()}
            </div>
            <button
              onClick={onSignOut}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Message area ── */}
      <main className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {!hasStarted ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center h-full gap-10 px-6 pb-16">
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/6 border border-white/10 mx-auto mb-6">
                <KaiLogo size={22} />
              </div>
              <h1 className="text-xl font-medium text-white/90">
                Hey {firstName} — I&apos;m Kai
              </h1>
              <p className="text-sm text-white/40 max-w-xs leading-relaxed">
                Tell me about your week and I&apos;ll build a schedule that actually works with how your brain operates.
              </p>
            </div>

            {/* Starter chips */}
            <div className="flex flex-wrap gap-2.5 justify-center max-w-sm">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStarter(s)}
                  className="px-4 py-2 text-xs text-white/60 rounded-full border border-white/10 hover:border-white/25 hover:text-white/80 hover:bg-white/4 transition-all duration-150 cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation */
          <div className="pt-4 pb-4 space-y-0.5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <TypingIndicator />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* ── Input bar ── */}
      <footer className="flex-shrink-0 px-4 pb-5 pt-3 border-t border-white/6">
        <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-white/20 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasStarted ? "Reply to Kai..." : "Tell Kai about your week..."}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/25 resize-none outline-none leading-relaxed disabled:opacity-40"
            style={{ maxHeight: "140px", fontFamily: "inherit" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-white disabled:opacity-20 hover:bg-white/90 active:scale-95 transition-all duration-100 cursor-pointer disabled:cursor-default mb-0.5"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="#18181b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="text-center text-white/15 text-[10px] mt-2.5">
          Kai builds schedules using energy science — not just your calendar.
        </p>
      </footer>
    </div>
  );
}
