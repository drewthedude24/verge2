import type { BrowserSupabaseClient } from "@/lib/supabase";

export type LeaderboardPlayer = {
  userId: string;
  displayName: string;
  email: string | null;
  totalEarnedPoints: number;
  totalAvailablePoints: number;
  sessionEarnedPoints: number;
  sessionAvailablePoints: number;
  currentTaskTitle: string | null;
  currentElapsedSeconds: number;
  isTimerRunning: boolean;
  lockInMode: boolean;
  updatedAt: string;
};

type UserProfileRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  updated_at: string;
};

type PlayerLiveStatusRow = {
  user_id: string;
  total_earned_points: number | null;
  total_available_points: number | null;
  session_earned_points: number | null;
  session_available_points: number | null;
  current_task_title: string | null;
  current_elapsed_seconds: number | null;
  is_timer_running: boolean | null;
  lock_in_mode: boolean | null;
  updated_at: string;
};

function userProfilesTable(supabase: BrowserSupabaseClient) {
  return supabase.from("user_profiles" as never);
}

function playerLiveStatusTable(supabase: BrowserSupabaseClient) {
  return supabase.from("player_live_status" as never);
}

function normalizePlayer(row: PlayerLiveStatusRow | null | undefined, profile: UserProfileRow | null | undefined): LeaderboardPlayer | null {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    displayName: profile?.display_name || profile?.email?.split("@")[0] || "Verge player",
    email: profile?.email || null,
    totalEarnedPoints: Math.max(0, row.total_earned_points || 0),
    totalAvailablePoints: Math.max(0, row.total_available_points || 0),
    sessionEarnedPoints: Math.max(0, row.session_earned_points || 0),
    sessionAvailablePoints: Math.max(0, row.session_available_points || 0),
    currentTaskTitle: row.current_task_title || null,
    currentElapsedSeconds: Math.max(0, row.current_elapsed_seconds || 0),
    isTimerRunning: Boolean(row.is_timer_running),
    lockInMode: Boolean(row.lock_in_mode),
    updatedAt: row.updated_at,
  };
}

export async function upsertUserProfile({
  supabase,
  userId,
  displayName,
  email,
}: {
  supabase: BrowserSupabaseClient;
  userId: string;
  displayName: string;
  email: string | null;
}) {
  await userProfilesTable(supabase).upsert(
    {
      user_id: userId,
      display_name: displayName,
      email,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id" },
  );
}

export async function publishPlayerLiveStatus({
  supabase,
  userId,
  totalEarnedPoints,
  totalAvailablePoints,
  sessionEarnedPoints,
  sessionAvailablePoints,
  currentTaskTitle,
  currentElapsedSeconds,
  isTimerRunning,
  lockInMode,
}: {
  supabase: BrowserSupabaseClient;
  userId: string;
  totalEarnedPoints: number;
  totalAvailablePoints: number;
  sessionEarnedPoints: number;
  sessionAvailablePoints: number;
  currentTaskTitle: string | null;
  currentElapsedSeconds: number;
  isTimerRunning: boolean;
  lockInMode: boolean;
}) {
  await playerLiveStatusTable(supabase).upsert(
    {
      user_id: userId,
      total_earned_points: totalEarnedPoints,
      total_available_points: totalAvailablePoints,
      session_earned_points: sessionEarnedPoints,
      session_available_points: sessionAvailablePoints,
      current_task_title: currentTaskTitle,
      current_elapsed_seconds: currentElapsedSeconds,
      is_timer_running: isTimerRunning,
      lock_in_mode: lockInMode,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id" },
  );
}

export async function loadLeaderboardPlayers(supabase: BrowserSupabaseClient) {
  const [{ data: profileRows }, { data: statusRows }] = await Promise.all([
    userProfilesTable(supabase)
      .select("user_id, display_name, email, updated_at")
      .order("updated_at", { ascending: false }),
    playerLiveStatusTable(supabase)
      .select(
        "user_id, total_earned_points, total_available_points, session_earned_points, session_available_points, current_task_title, current_elapsed_seconds, is_timer_running, lock_in_mode, updated_at",
      )
      .order("updated_at", { ascending: false }),
  ]);

  const profileMap = new Map<string, UserProfileRow>();
  for (const row of (profileRows as UserProfileRow[] | null) || []) {
    profileMap.set(row.user_id, row);
  }

  return ((statusRows as PlayerLiveStatusRow[] | null) || [])
    .map((row) => normalizePlayer(row, profileMap.get(row.user_id)))
    .filter(Boolean) as LeaderboardPlayer[];
}
