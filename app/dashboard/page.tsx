"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        setUser(data.user);
      }
    });
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0c0e]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0c0e] px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">Verge</h1>
        <p className="mt-2 text-sm text-zinc-500">Signed in as {user.email}</p>
        <button
          onClick={signOut}
          className="mt-6 rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm text-zinc-400 transition hover:text-white"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
