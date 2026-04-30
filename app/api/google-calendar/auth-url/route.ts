import { NextRequest } from "next/server";
import { buildApiCorsHeaders } from "@/lib/api-cors";
import { buildGoogleCalendarAuthUrl, isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { getAuthenticatedUserFromBearer, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

function buildHeaders() {
  return buildApiCorsHeaders();
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

  return Response.json(
    {
      authUrl: buildGoogleCalendarAuthUrl(user.id),
    },
    {
      headers: buildHeaders(),
    },
  );
}
