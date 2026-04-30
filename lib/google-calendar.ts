import { createHmac, randomUUID } from "node:crypto";
import type { CalendarEvent } from "@/lib/calendar-store";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export type GoogleCalendarConnectionRow = {
  user_id: string;
  google_email: string | null;
  calendar_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type GoogleUserInfo = {
  email?: string;
};

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || "",
    stateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  };
}

export function isGoogleCalendarConfigured() {
  const config = getGoogleConfig();
  return Boolean(config.clientId && config.clientSecret && config.redirectUri && config.stateSecret);
}

type GoogleOAuthStatePayload = {
  userId: string;
  nonce: string;
  createdAt: string;
};

export function buildGoogleOAuthState(userId: string) {
  const config = getGoogleConfig();
  if (!config.stateSecret) {
    throw new Error("GOOGLE_OAUTH_STATE_SECRET is missing.");
  }

  const payload: GoogleOAuthStatePayload = {
    userId,
    nonce: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.stateSecret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyGoogleOAuthState(state: string | null) {
  if (!state) {
    return null;
  }

  const config = getGoogleConfig();
  if (!config.stateSecret) {
    return null;
  }

  const [encodedPayload, providedSignature] = state.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", config.stateSecret).update(encodedPayload).digest("base64url");
  if (expectedSignature !== providedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as GoogleOAuthStatePayload;
    if (!payload.userId) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function buildGoogleCalendarAuthUrl(userId: string) {
  const config = getGoogleConfig();
  const url = new URL(GOOGLE_AUTH_BASE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", buildGoogleOAuthState(userId));
  return url.toString();
}

async function postGoogleToken(params: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed with status ${response.status}.`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeGoogleCalendarCode(code: string) {
  const config = getGoogleConfig();
  const params = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  return postGoogleToken(params);
}

export async function refreshGoogleCalendarAccessToken(refreshToken: string) {
  const config = getGoogleConfig();
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  return postGoogleToken(params);
}

export function buildGoogleExpiryTimestamp(expiresInSeconds?: number) {
  if (!expiresInSeconds || !Number.isFinite(expiresInSeconds)) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

export async function fetchGoogleCalendarUserInfo(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GoogleUserInfo;
}

export function getGoogleCalendarColorId(kind: CalendarEvent["kind"]) {
  switch (kind) {
    case "task":
      return "6";
    case "fixed":
      return "3";
    case "workout":
      return "11";
    case "break":
    case "recovery":
      return "2";
    case "buffer":
    case "commute":
      return "9";
    case "meal":
      return "5";
    default:
      return "8";
  }
}

function buildGoogleCalendarEventPayload(event: CalendarEvent, timeZone: string) {
  const shared = {
    summary: event.title,
    description: event.notes || undefined,
    colorId: getGoogleCalendarColorId(event.kind),
    extendedProperties: {
      private: {
        vergeEventKey: event.eventKey,
      },
    },
  };

  if (!event.startTime || !event.endTime) {
    const startDate = new Date(`${event.eventDate}T12:00:00`);
    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + 1);

    return {
      ...shared,
      start: {
        date: event.eventDate,
      },
      end: {
        date: nextDate.toISOString().slice(0, 10),
      },
    };
  }

  return {
    ...shared,
    start: {
      dateTime: `${event.eventDate}T${event.startTime}:00`,
      timeZone,
    },
    end: {
      dateTime: `${event.eventDate}T${event.endTime}:00`,
      timeZone,
    },
  };
}

async function requestGoogleCalendarJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Google Calendar request failed with status ${response.status}. ${details.slice(0, 240)}`);
  }

  return response.json();
}

export async function createOrUpdateGoogleCalendarEvent({
  accessToken,
  calendarId,
  existingEventId,
  event,
  timeZone,
}: {
  accessToken: string;
  calendarId: string;
  existingEventId?: string | null;
  event: CalendarEvent;
  timeZone: string;
}) {
  const payload = buildGoogleCalendarEventPayload(event, timeZone);
  const baseUrl = `${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`;
  const method = existingEventId ? "PATCH" : "POST";
  const url = existingEventId ? `${baseUrl}/${encodeURIComponent(existingEventId)}` : baseUrl;
  const response = (await requestGoogleCalendarJson(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })) as { id?: string | null };

  return response.id || null;
}
