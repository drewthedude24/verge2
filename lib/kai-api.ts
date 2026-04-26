function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getKaiApiBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_KAI_API_BASE_URL?.trim() || "");
}

export function buildKaiApiUrl(path = "/api/kai") {
  const baseUrl = getKaiApiBaseUrl();
  if (!baseUrl) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function isHostedKaiConfigured() {
  return Boolean(getKaiApiBaseUrl());
}
