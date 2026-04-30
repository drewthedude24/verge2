import { NextRequest } from "next/server";
import { buildApiCorsHeaders } from "@/lib/api-cors";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { createSupabaseAdminClient, getAuthenticatedUserFromBearer, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

function buildHeaders() {
  return buildApiCorsHeaders();
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
    return Response.json(
      { configured: isGoogleCalendarConfigured(), connected: false, email: null, calendarId: null },
      { status: 401, headers: buildHeaders() },
    );
  }

  if (!isGoogleCalendarConfigured() || !isSupabaseServiceRoleConfigured()) {
    return Response.json(
      { configured: false, connected: false, email: null, calendarId: null },
      { headers: buildHeaders() },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("google_calendar_connections")
    .select("google_email, calendar_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json(
    {
      configured: true,
      connected: Boolean(data),
      email: data?.google_email || null,
      calendarId: data?.calendar_id || null,
    },
    { headers: buildHeaders() },
  );
}
