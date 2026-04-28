import type { BrowserSupabaseClient } from "@/lib/supabase";

export type UserPreferences = {
  focusMinutes: number | null;
  wakeTime: string | null;
  sleepTime: string | null;
  peakFocus: "morning" | "mid-morning" | "afternoon" | "evening" | "unknown";
  lowEnergy: "morning" | "afternoon" | "evening" | "unknown";
  notes: string;
};

type PreferenceRow = {
  user_id: string;
  focus_minutes: number | null;
  wake_time: string | null;
  sleep_time: string | null;
  peak_focus: UserPreferences["peakFocus"];
  low_energy: UserPreferences["lowEnergy"];
  notes: string | null;
};

type PreferenceInsertRow = {
  user_id: string;
  focus_minutes: number | null;
  wake_time: string | null;
  sleep_time: string | null;
  peak_focus: UserPreferences["peakFocus"];
  low_energy: UserPreferences["lowEnergy"];
  notes: string | null;
};

const LOCAL_PREFERENCE_KEY = "verge-user-preferences";

export function buildDefaultPreferences(): UserPreferences {
  return {
    focusMinutes: 90,
    wakeTime: null,
    sleepTime: null,
    peakFocus: "unknown",
    lowEnergy: "unknown",
    notes: "",
  };
}

export function buildPreferenceContext(preferences: UserPreferences | null) {
  if (!preferences) {
    return null;
  }

  const lines = [
    "Authoritative saved user preferences for this session:",
    "Use these immediately unless the user explicitly overrides them later in chat.",
    "If the user asks what their bedtime, wake time, focus length, or energy window is, answer from this data directly.",
    preferences.focusMinutes ? `- optimal focus block: ${preferences.focusMinutes} minutes` : null,
    preferences.wakeTime ? `- wake time: ${preferences.wakeTime}` : null,
    preferences.sleepTime ? `- bedtime / sleep time: ${preferences.sleepTime}` : null,
    preferences.peakFocus !== "unknown" ? `- best focus window: ${preferences.peakFocus}` : null,
    preferences.lowEnergy !== "unknown" ? `- low energy window: ${preferences.lowEnergy}` : null,
    preferences.notes.trim() ? `- notes: ${preferences.notes.trim()}` : null,
  ].filter(Boolean);

  return lines.length > 1 ? lines.join("\n") : null;
}

function getLocalStorageKey(userId: string | null) {
  return `${LOCAL_PREFERENCE_KEY}:${userId || "guest"}`;
}

function readLocalPreferences(userId: string | null) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getLocalStorageKey(userId));
    if (!raw) {
      return null;
    }

    return normalizePreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalPreferences(userId: string | null, preferences: UserPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(preferences));
  } catch {}
}

function normalizePreferences(raw: Partial<UserPreferences> | null | undefined): UserPreferences {
  return {
    focusMinutes:
      typeof raw?.focusMinutes === "number" && Number.isFinite(raw.focusMinutes)
        ? Math.max(15, Math.min(120, Math.round(raw.focusMinutes)))
        : buildDefaultPreferences().focusMinutes,
    wakeTime: raw?.wakeTime || null,
    sleepTime: raw?.sleepTime || null,
    peakFocus:
      raw?.peakFocus === "morning" ||
      raw?.peakFocus === "mid-morning" ||
      raw?.peakFocus === "afternoon" ||
      raw?.peakFocus === "evening"
        ? raw.peakFocus
        : "unknown",
    lowEnergy:
      raw?.lowEnergy === "morning" || raw?.lowEnergy === "afternoon" || raw?.lowEnergy === "evening"
        ? raw.lowEnergy
        : "unknown",
    notes: raw?.notes || "",
  };
}

function normalizePreferenceRow(row: PreferenceRow | null): UserPreferences | null {
  if (!row) {
    return null;
  }

  return normalizePreferences({
    focusMinutes: row.focus_minutes,
    wakeTime: row.wake_time,
    sleepTime: row.sleep_time,
    peakFocus: row.peak_focus,
    lowEnergy: row.low_energy,
    notes: row.notes || "",
  });
}

function userPreferencesTable(supabase: BrowserSupabaseClient) {
  return supabase.from("user_preferences" as never);
}

export async function loadUserPreferences({
  supabase,
  userId,
}: {
  supabase: BrowserSupabaseClient | null;
  userId: string | null;
}) {
  const local = readLocalPreferences(userId);

  if (!supabase || !userId) {
    return local || buildDefaultPreferences();
  }

  try {
    const { data, error } = await userPreferencesTable(supabase)
      .select("user_id, focus_minutes, wake_time, sleep_time, peak_focus, low_energy, notes")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return local || buildDefaultPreferences();
    }

    const normalized = normalizePreferenceRow(data as PreferenceRow | null) || local || buildDefaultPreferences();
    writeLocalPreferences(userId, normalized);
    return normalized;
  } catch {
    return local || buildDefaultPreferences();
  }
}

export async function saveUserPreferences({
  supabase,
  userId,
  preferences,
}: {
  supabase: BrowserSupabaseClient | null;
  userId: string | null;
  preferences: UserPreferences;
}) {
  const normalized = normalizePreferences(preferences);
  writeLocalPreferences(userId, normalized);

  if (!supabase || !userId) {
    return normalized;
  }

  try {
    await userPreferencesTable(supabase).upsert({
      user_id: userId,
      focus_minutes: normalized.focusMinutes,
      wake_time: normalized.wakeTime,
      sleep_time: normalized.sleepTime,
      peak_focus: normalized.peakFocus,
      low_energy: normalized.lowEnergy,
      notes: normalized.notes || null,
    } as PreferenceInsertRow as never);
  } catch {
    // Local cache already has the saved copy.
  }

  return normalized;
}
