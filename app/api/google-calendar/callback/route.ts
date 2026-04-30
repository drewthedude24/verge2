import { NextRequest } from "next/server";
import {
  buildGoogleExpiryTimestamp,
  exchangeGoogleCalendarCode,
  fetchGoogleCalendarUserInfo,
  isGoogleCalendarConfigured,
  verifyGoogleOAuthState,
} from "@/lib/google-calendar";
import { createSupabaseAdminClient, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

function renderHtml(title: string, body: string) {
  return new Response(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #0b0e13; color: white; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { width: min(92vw, 520px); padding: 32px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); text-align: center; }
      p { color: rgba(255,255,255,0.72); line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${body}</p>
    </main>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  if (!isGoogleCalendarConfigured() || !isSupabaseServiceRoleConfigured()) {
    return renderHtml("Google Calendar unavailable", "This backend is missing Google Calendar credentials. Add them in Vercel and try again.");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const payload = verifyGoogleOAuthState(state);

  if (!code || !payload) {
    return renderHtml("Connection failed", "The Google Calendar callback was invalid. Start the connection again from Verge.");
  }

  try {
    const tokenResponse = await exchangeGoogleCalendarCode(code);
    const userInfo = await fetchGoogleCalendarUserInfo(tokenResponse.access_token);
    const admin = createSupabaseAdminClient();

    await admin.from("google_calendar_connections").upsert(
      {
        user_id: payload.userId,
        google_email: userInfo?.email || null,
        calendar_id: "primary",
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token || null,
        expires_at: buildGoogleExpiryTimestamp(tokenResponse.expires_in),
        scope: tokenResponse.scope || null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    );

    return renderHtml("Google Calendar connected", "Verge is now linked to your Google Calendar. You can close this tab and return to the app.");
  } catch (error) {
    console.error("[Google Calendar] OAuth callback failed:", error);
    return renderHtml("Connection failed", "Verge could not finish the Google Calendar connection. Try again from the Calendar panel.");
  }
}
