// lib/supabase.ts
// Browser-side Supabase singleton.
// Adapted from the Kai integration — uses @supabase/supabase-js directly
// (no @supabase/ssr needed for this client-only Electron app).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  if (!_client) {
    _client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
