import { NextRequest } from "next/server";
import { buildApiCorsHeaders } from "@/lib/api-cors";
import { getGoogleCalendarColorHex, isGoogleCalendarConfigured, listGoogleCalendarEvents, refreshGoogleCalendarAccessToken, buildGoogleExpiryTimestamp, type GoogleCalendarConnectionRow } from "@/lib/google-calendar";
import { createSupabaseAdminClient, getAuthenticatedUserFromBearer, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

type StoredCalendarEventRow = {
  event_key: string;
  title: string;
  kind: string | null;
  color: string | null;
  source_plan_key: string | null;
  source_block_id: string | null;
  notes: string | null;
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

  const { error } = await admin.from("google_calendar_connections").upsert(
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

  if (error) {
    throw new Error(error.message);
  }

  return nextConnection;
}

function normalizeGoogleTimes(event: {
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}) {
  const startDateTime = event.start?.dateTime || null;
  const endDateTime = event.end?.dateTime || null;
  const startDate = event.start?.date || null;
  const endDate = event.end?.date || null;

  if (startDateTime && endDateTime) {
    return {
      eventDate: startDateTime.slice(0, 10),
      startTime: startDateTime.slice(11, 16),
      endTime: endDateTime.slice(11, 16),
    };
  }

  if (startDate) {
    return {
      eventDate: startDate,
      startTime: null,
      endTime: null,
    };
  }

  return {
    eventDate: endDate || new Date().toISOString().slice(0, 10),
    startTime: null,
    endTime: null,
  };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: buildHeaders(),
  });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromBearer(request.headers.get("authorization"));
  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
      headers: buildHeaders(),
    });
  }

  if (!isGoogleCalendarConfigured() || !isSupabaseServiceRoleConfigured()) {
    return Response.json(
      { connected: false, events: [] },
      { headers: buildHeaders() },
    );
  }

  const admin = createSupabaseAdminClient();
  const storedConnection = await getStoredConnection(admin, user.id);
  if (!storedConnection) {
    return Response.json(
      { connected: false, events: [] },
      { headers: buildHeaders() },
    );
  }

  const url = new URL(request.url);
  const rangeStart = url.searchParams.get("from") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = url.searchParams.get("to") || new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
  const connection = await refreshStoredConnectionIfNeeded(admin, storedConnection);

  const googleEvents = await listGoogleCalendarEvents({
    accessToken: connection.access_token,
    calendarId: connection.calendar_id || "primary",
    timeMin: rangeStart,
    timeMax: rangeEnd,
  });

  const externalIds = googleEvents.map((event) => event.id).filter(Boolean) as string[];
  const { data: storedRows } = externalIds.length
    ? await admin
        .from("calendar_events")
        .select("event_key, title, kind, color, source_plan_key, source_block_id, notes, external_event_id")
        .eq("user_id", user.id)
        .in("external_event_id", externalIds)
    : { data: [] };

  const storedByExternalId = new Map<string, StoredCalendarEventRow>();
  for (const row of ((storedRows as StoredCalendarEventRow[] | null) || [])) {
    if (row.external_event_id) {
      storedByExternalId.set(row.external_event_id, row);
    }
  }

  const normalizedEvents = googleEvents
    .map((event) => {
      if (!event.id) {
        return null;
      }

      const stored = storedByExternalId.get(event.id);
      const timing = normalizeGoogleTimes(event);
      const vergeEventKey = event.extendedProperties?.private?.vergeEventKey || stored?.event_key || `google:${event.id}`;

      return {
        id: event.id,
        eventKey: vergeEventKey,
        title: stored?.title || event.summary || "Untitled event",
        eventDate: timing.eventDate,
        startTime: timing.startTime,
        endTime: timing.endTime,
        kind: (stored?.kind as "task" | "break" | "buffer" | "fixed" | "meal" | "workout" | "recovery" | "commute" | null) || "fixed",
        color: stored?.color || getGoogleCalendarColorHex(event.colorId),
        status: "scheduled",
        sourcePlanKey: stored?.source_plan_key || null,
        sourceBlockId: stored?.source_block_id || null,
        externalProvider: "google",
        externalEventId: event.id,
        notes: stored?.notes || event.description || null,
        htmlLink: event.htmlLink || null,
      };
    })
    .filter(Boolean);

  return Response.json(
    {
      connected: true,
      calendarId: connection.calendar_id || "primary",
      events: normalizedEvents,
    },
    { headers: buildHeaders() },
  );
}
