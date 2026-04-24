import { createClient, getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase";

export const supabase = createClient();

export { createClient, getSupabaseConfig, isSupabaseConfigured };
