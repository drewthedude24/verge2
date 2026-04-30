const CORS_ALLOW_ORIGIN = process.env.KAI_CORS_ALLOW_ORIGIN?.trim() || "*";

export function buildApiCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
