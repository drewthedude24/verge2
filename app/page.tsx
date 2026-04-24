"use client";

// app/page.tsx
// Root page — handles auth state and switches between your existing sign-in
// screen and the Kai full-screen chat. Replace <YourSignInComponent /> with
// whatever your existing sign-in screen component is called.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import KaiChat from "@/components/kai/KaiChat";

// ⬇️ Replace this import with your actual existing sign-in component
import SignIn from "@/components/auth/SignIn";

export default function RootPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Fallback: if getSession hangs for more than 3s, show sign-in anyway
    const timeout = setTimeout(() => setLoading(false), 3000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Loading splash — matches Verge's dark aesthetic
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <span
            className="text-xs font-semibold tracking-[0.2em] text-white/20 uppercase"
            style={{ fontFamily: "var(--font-geist-sans, 'Geist', sans-serif)" }}
          >
            VERGE
          </span>
          <div className="w-4 h-4 rounded-full border border-white/20 border-t-white/60 animate-spin" />
        </div>
      </div>
    );
  }

  // Not authenticated → show your existing sign-in screen
  if (!user) {
    return <SignIn />;
  }

  // Authenticated → show Kai full-screen chat
  return <KaiChat user={user} onSignOut={handleSignOut} />;
}
