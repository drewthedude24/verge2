"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    clearMessages();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess(
          "Account created! Check your email to confirm, then sign in."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0c0c0e] px-4">
      {/* Subtle radial glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-center justify-center"
      >
        <div className="h-[520px] w-[520px] rounded-full bg-orange-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <span className="text-4xl font-bold tracking-tight text-white">
            Verge
          </span>
          <p className="mt-2 text-sm text-zinc-500">
            {mode === "signin"
              ? "Welcome back. Sign in to continue."
              : "Create your account to get started."}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-8 py-8 shadow-2xl backdrop-blur-sm">

          {/* Toggle tabs */}
          <div className="mb-7 flex rounded-lg bg-white/[0.04] p-1">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-all duration-200 ${
                  mode === m
                    ? "bg-[#1a1a1f] text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            {/* Forgot password */}
            {mode === "signin" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-zinc-500 transition hover:text-orange-400"
                  onClick={() =>
                    setSuccess("Password reset is coming soon.")
                  }
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Feedback */}
            {error && (
              <p className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-lg bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400">
                {success}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-900/30 transition hover:bg-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By continuing you agree to our{" "}
          <span className="cursor-pointer text-zinc-500 hover:text-zinc-400">
            Terms
          </span>{" "}
          &amp;{" "}
          <span className="cursor-pointer text-zinc-500 hover:text-zinc-400">
            Privacy Policy
          </span>
          .
        </p>
      </div>
    </main>
  );
}
