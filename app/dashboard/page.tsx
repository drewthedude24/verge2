"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090d]">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
    </main>
  );
}
