/** Keep the initiating identity across a refresh/retry, even if another tab logs in. */
export function pinRequestIdentity(
  path: string,
  options: RequestInit,
  identity: { userId: string | null; contextKey: string | null },
): RequestInit {
  const endpoint = path.split("?", 1)[0];
  if (["/auth/login", "/auth/refresh", "/auth/csrf", "/auth/forgot-password", "/auth/reset-password", "/auth/logout"].includes(endpoint!) ||
    (endpoint === "/auth/me" && (options.method ?? "GET").toUpperCase() === "GET")) return options;
  const headers = new Headers(options.headers);
  if (!headers.has("X-DND-User")) headers.set("X-DND-User", identity.userId ?? "anonymous");
  if (identity.contextKey && !headers.has("X-DND-Context")) headers.set("X-DND-Context", identity.contextKey);
  return { ...options, headers };
}
