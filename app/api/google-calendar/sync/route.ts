import { NextRequest } from "next/server";
import type { CalendarEvent } from "@/lib/calendar-store";
import { buildApiCorsHeaders } from "@/lib/api-cors";
import {
  buildGoogleExpiryTimestamp,
  createOrUpdateGoogleCalendarEvent,
  isGoogleCalendarConfigured,
  refreshGoogleCalendarAccessToken,
  type GoogleCalendarConnectionRow,
} from "@/lib/google-calendar";
import { createSupabaseAdminClient, getAuthenticatedUserFromBearer, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

type CalendarSyncBody = {
  events?: CalendarEvent[];
  planKey?: string | null;
  timeZone?: string | null;
};

type StoredCalendarEventRow = {
  event_key: string;
  external_event_id: string | null;
};

function buildHeaders() {
  return buildApiCorsHeaders();
}

function isConnectionExpired(expiresAt: string | null) {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= Date.now() + 60_000;
}

async function getStoredConnection(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("google_calendar_connections")
    .select("user_id, google_email, calendar_id, access_token, refresh_token, expires_at, scope, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as GoogleCalendarConnectionRow | null) || null;
}

async function refreshStoredConnectionIfNeeded(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  connection: GoogleCalendarConnectionRow,
) {
  if (!connection.refresh_token || !isConnectionExpired(connection.expires_at || null)) {
    return connection;
  }

  const refreshed = await refreshGoogleCalendarAccessToken(connection.refresh_token);
  const nextConnection: GoogleCalendarConnectionRow = {
    ...connection,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || connection.refresh_token,
    expires_at: buildGoogleExpiryTimestamp(refreshed.expires_in),
    scope: refreshed.scope || connection.scope,
    updated_at: new Date().toISOString(),
  };

  await admin.from("google_calendar_connections").upsert(
    {
      user_id: nextConnection.user_id,
      google_email: nextConnection.google_email,
      calendar_id: nextConnection.calendar_id || "primary",
      access_token: nextConnection.access_token,
      refresh_token: nextConnection.refresh_token,
      expires_at: nextConnection.expires_at,
      scope: nextConnection.scope,
      updated_at: nextConnection.updated_at,
    } as never,
    { onConflict: "user_id" },
  );

  return nextConnection;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: buildHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserFromBearer(request.headers.get("authorization"));
  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
      headers: buildHeaders(),
    });
  }

  if (!isGoogleCalendarConfigured() || !isSupabaseServiceRoleConfigured()) {
    return new Response("Google Calendar server config is incomplete.", {
      status: 400,
      headers: buildHeaders(),
    });
  }

  const body = (await request.json().catch(() => null)) as CalendarSyncBody | null;
  const events = Array.isArray(body?.events) ? body?.events : [];
  if (!events.length) {
    return Response.json({ syncedCount: 0 }, { headers: buildHeaders() });
  }

  const admin = createSupabaseAdminClient();
  const storedConnection = await getStoredConnection(admin, user.id);
  if (!storedConnection) {
    return new Response("Google Calendar is not connected for this account yet.", {
      status: 400,
      headers: buildHeaders(),
    });
  }

  const connection = await refreshStoredConnectionIfNeeded(admin, storedConnection);
  const eventKeys = events.map((event) => event.eventKey).filter(Boolean);
  const { data: existingRows, error: existingRowsError } = await admin
    .from("calendar_events")
    .select("event_key, external_event_id")
    .eq("user_id", user.id)
    .in("event_key", eventKeys);

  if (existingRowsError) {
    return new Response(existingRowsError.message, {
      status: 500,
      headers: buildHeaders(),
    });
  }

  const existingMap = new Map<string, StoredCalendarEventRow>();
  for (const row of ((existingRows as StoredCalendarEventRow[] | null) || [])) {
    existingMap.set(row.event_key, row);
  }

  const syncedRows = [];
  const fallbackTimeZone = body?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";

  for (const event of events) {
    const existing = existingMap.get(event.eventKey);
    const externalEventId =
      (await createOrUpdateGoogleCalendarEvent({
        accessToken: connection.access_token,
        calendarId: connection.calendar_id || "primary",
        existingEventId: existing?.external_event_id || event.externalEventId || null,
        event,
        timeZone: fallbackTimeZone,
      })) || existing?.external_event_id || event.externalEventId || null;

    syncedRows.push({
      user_id: user.id,
      event_key: event.eventKey,
      title: event.title,
      event_date: event.eventDate,
      start_time: event.startTime,
      end_time: event.endTime,
      kind: event.kind,
      color: event.color,
      status: event.status,
      source_plan_key: event.sourcePlanKey || body?.planKey || null,
      source_block_id: event.sourceBlockId,
      external_provider: "google",
      external_event_id: externalEventId,
      notes: event.notes,
      updated_at: new Date().toISOString(),
    });
  }

  const { error: upsertError } = await admin.from("calendar_events").upsert(syncedRows as never, {
    onConflict: "user_id,event_key",
  });

  if (upsertError) {
    return new Response(upsertError.message, {
      status: 500,
      headers: buildHeaders(),
    });
  }

  return Response.json(
    {
      syncedCount: syncedRows.length,
      calendarId: connection.calendar_id || "primary",
    },
    {
      headers: buildHeaders(),
    },
  );
}
