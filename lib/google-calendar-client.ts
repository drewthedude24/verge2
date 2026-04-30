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
