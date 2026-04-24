"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import SignIn from "@/components/auth/SignIn";
import KaiChat, { type ChatViewer } from "@/components/kai/KaiChat";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

export default function RootPage() {
  const [user, setUser] = useState<User | null>(null);
  const authConfigured = isSupabaseConfigured();
  const [loading, setLoading] = useState(authConfigured);
  const supabase = createClient();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const timeout = setTimeout(() => setLoading(false), 3_000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const viewer = useMemo<ChatViewer>(() => {
    if (!user) {
      return {
        name: "Preview",
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
      name: displayName,
      email: user.email ?? null,
      isGuest: false,
    };
  }, [user]);

  async function handleSignOut() {
    await supabase?.auth.signOut();
  }

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
      onSignOut={user ? handleSignOut : undefined}
      mode={authConfigured ? "live" : "preview"}
    />
  );
}
