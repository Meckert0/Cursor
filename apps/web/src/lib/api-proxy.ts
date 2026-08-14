const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

export function resolveApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function resolveApiProxyUrl(
  pathSegments: string[] | undefined,
  search: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const suffix = pathSegments?.length ? pathSegments.map(encodeURIComponent).join("/") : "";
  const path = suffix ? `/v1/${suffix}` : "/v1";
  return `${resolveApiBaseUrl(env)}${path}${search}`;
}

export function copyForwardableHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}
