"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import DesktopShell from "@/components/layout/DesktopShell";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function SignIn() {
  const supabase = createClient();
  const authConfigured = isSupabaseConfigured();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    clearMessages();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearMessages();

    if (!supabase) {
      setError("Supabase is not configured yet. Add your project credentials to .env.local first.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          throw signUpError;
        }
        setSuccess("Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw signInError;
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DesktopShell
      badge="Verge Auth"
      title="Sign in to sync Verge"
      subtitle="Supabase-backed auth is optional. If credentials are missing, the app can still run in preview mode from the home screen."
      contentClassName="flex items-center justify-center p-4 md:p-10"
    >
      <div className="grid w-full max-w-5xl gap-6 md:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-100">
            Verge
          </span>
          <h2 className="mt-6 max-w-[12ch] text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Talk through your day and shape the plan.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/55 md:text-base">
            The desktop shell is now set up to feel like a real floating app. Auth is here if you
            want synced sessions and persistent users, but it no longer blocks the rest of the app
            from building or previewing.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <FeatureCard
              title="Desktop shell"
              copy="Frameless Electron window, glass surface, and desktop controls are wired in."
            />
            <FeatureCard
              title="Live or preview"
              copy="With Supabase and Gemini keys, Verge runs live. Without them, it still stays explorable."
            />
            <FeatureCard
              title="Understandable flow"
              copy="Auth, chat, and desktop behavior are now separated more clearly in the codebase."
            />
            <FeatureCard
              title="Future-safe UI"
              copy="This shell is ready for planners, transcripts, timers, and AI operators later."
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-[#0d1117]/92 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/35">
                {authConfigured ? "Auth ready" : "Setup needed"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {authConfigured ? "Account access" : "Supabase not configured yet"}
              </h3>
            </div>
            {!authConfigured ? (
              <Link
                href="/"
                className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Open preview
              </Link>
            ) : null}
          </div>

          {!authConfigured ? (
            <div className="space-y-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 p-5 text-sm leading-7 text-amber-50/85">
              <p>
                Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
                to enable sign-in. Until then, Verge can still run from the home screen in preview
                mode.
              </p>
              <p className="text-amber-50/65">
                The build no longer crashes when these values are missing, which makes local setup
                much less brittle.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex rounded-xl bg-white/[0.04] p-1">
                {(["signin", "signup"] as Mode[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchMode(value)}
                    className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
                      mode === value ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                    }`}
                  >
                    {value === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/45">
                    Email
                  </span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/60 focus:ring-2 focus:ring-orange-400/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/45">
                    Password
                  </span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/60 focus:ring-2 focus:ring-orange-400/15"
                  />
                </label>

                {error ? <MessageTone tone="error">{error}</MessageTone> : null}
                {success ? <MessageTone tone="success">{success}</MessageTone> : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? mode === "signin"
                      ? "Signing in…"
                      : "Creating account…"
                    : mode === "signin"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </DesktopShell>
  );
}

function FeatureCard({ title, copy }: { title: string; copy: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/18 p-4">
      <strong className="text-sm text-white">{title}</strong>
      <p className="mt-2 text-sm leading-6 text-white/55">{copy}</p>
    </article>
  );
}

function MessageTone({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const classes =
    tone === "error"
      ? "border border-red-400/20 bg-red-400/10 text-red-100"
      : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100";

  return <p className={`rounded-xl px-4 py-3 text-sm ${classes}`}>{children}</p>;
}
