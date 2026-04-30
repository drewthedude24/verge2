import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type BrowserSupabaseClient = ReturnType<typeof createSupabaseClient>;

let browserClient: BrowserSupabaseClient | null = null;
export const DEFAULT_SUPABASE_URL = "https://nhhlryqmbdivsuqjjyop.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaGxyeXFtYmRpdnN1cWpqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTM2NjUsImV4cCI6MjA5MjcyOTY2NX0._1aF2pFNlUwM98miIZaqawny4MBdC9Ll2gD66AwNZeo";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;

  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig().configured;
}

export function createClient(): BrowserSupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.configured) {
    return null;
  }

  if (!browserClient) {
    browserClient = createSupabaseClient(config.url, config.anonKey);
  }

  return browserClient;
}
