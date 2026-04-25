"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import SignIn from "@/components/auth/SignIn";
import KaiChat, { type ChatViewer } from "@/components/kai/KaiChat";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

type KaiStatus = {
  liveModelConfigured: boolean | null;
  provider: string | null;
  model: string | null;
};

export default function RootPage() {
  const [user, setUser] = useState<User | null>(null);
  const [kaiStatus, setKaiStatus] = useState<KaiStatus>({
    liveModelConfigured: null,
    provider: null,
    model: null,
  });
  const authConfigured = isSupabaseConfigured();
  const [authLoading, setAuthLoading] = useState(authConfigured);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/kai", { method: "GET", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load Kai status");
        }

        const payload = (await response.json()) as {
          liveModelConfigured?: boolean;
          provider?: string | null;
          model?: string | null;
        };
        if (!cancelled) {
          setKaiStatus({
            liveModelConfigured: Boolean(payload.liveModelConfigured),
            provider: payload.provider ?? null,
            model: payload.model ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKaiStatus({
            liveModelConfigured: false,
            provider: null,
            model: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const timeout = setTimeout(() => setAuthLoading(false), 3_000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setUser(session?.user ?? null);
        setAuthLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const viewer = useMemo<ChatViewer>(() => {
    if (!user) {
      return {
        id: null,
        name: "Guest",
        email: null,
        isGuest: true,
      };
    }

    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Verge";

    return {
      id: user.id,
      name: displayName,
      email: user.email ?? null,
      isGuest: false,
    };
  }, [user]);

  async function handleSignOut() {
    await supabase?.auth.signOut();
  }

  const loading = (authConfigured && authLoading) || kaiStatus.liveModelConfigured === null;
  const mode = kaiStatus.liveModelConfigured ? "live" : "preview";
  const liveModelLabel = kaiStatus.liveModelConfigured
    ? [kaiStatus.provider, kaiStatus.model].filter(Boolean).join(" • ")
    : null;

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#07090d]">
        <div className="flex flex-col items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/25">VERGE</span>
          <div className="h-4 w-4 animate-spin rounded-full border border-white/20 border-t-white/60" />
        </div>
      </div>
    );
  }

  if (authConfigured && !user) {
    return <SignIn />;
  }

  return (
    <KaiChat
      viewer={viewer}
      liveModelLabel={liveModelLabel}
      onSignOut={user ? handleSignOut : undefined}
      mode={mode}
    />
  );
}
