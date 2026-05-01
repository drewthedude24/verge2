import { buildKaiApiUrl } from "@/lib/kai-api";
import type { CalendarEvent } from "@/lib/calendar-store";

async function requestAuthorizedJson<T>(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(buildKaiApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string | null;
};

export async function loadGoogleCalendarStatus(accessToken: string) {
  return requestAuthorizedJson<GoogleCalendarStatus>("/api/google-calendar/status", accessToken, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getGoogleCalendarAuthUrl(accessToken: string) {
  return requestAuthorizedJson<{ authUrl: string }>("/api/google-calendar/auth-url", accessToken, {
    method: "POST",
  });
}

export async function syncGoogleCalendarEvents({
  accessToken,
  events,
  planKey,
  timeZone,
}: {
  accessToken: string;
  events: CalendarEvent[];
  planKey: string | null;
  timeZone: string | null;
}) {
  return requestAuthorizedJson<{ syncedCount: number }>("/api/google-calendar/sync", accessToken, {
    method: "POST",
    body: JSON.stringify({
      events,
      planKey,
      timeZone,
    }),
  });
}

export async function loadGoogleCalendarEvents({
  accessToken,
  from,
  to,
}: {
  accessToken: string;
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams();
  if (from) {
    query.set("from", from);
  }
  if (to) {
    query.set("to", to);
  }

  const path = query.size ? `/api/google-calendar/events?${query.toString()}` : "/api/google-calendar/events";
  return requestAuthorizedJson<{
    connected: boolean;
    calendarId: string | null;
    events: Array<{
      id: string;
      eventKey: string;
      title: string;
      eventDate: string;
      startTime: string | null;
      endTime: string | null;
      kind: CalendarEvent["kind"];
      color: string;
      status: CalendarEvent["status"];
      sourcePlanKey: string | null;
      sourceBlockId: string | null;
      externalProvider: "google";
      externalEventId: string | null;
      notes: string | null;
      htmlLink?: string | null;
    }>;
  }>(path, accessToken, {
    method: "GET",
    cache: "no-store",
  });
}

export async function deleteGoogleCalendarEventForUser({
  accessToken,
  eventId,
  eventKey,
  externalEventId,
}: {
  accessToken: string;
  eventId?: string | null;
  eventKey?: string | null;
  externalEventId?: string | null;
}) {
  return requestAuthorizedJson<{ removed: boolean }>("/api/google-calendar/events", accessToken, {
    method: "DELETE",
    body: JSON.stringify({
      eventId,
      eventKey,
      externalEventId,
    }),
  });
}
