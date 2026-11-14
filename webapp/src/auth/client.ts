import { apiUrl } from "../config";
import { pinRequestIdentity } from "../../../shared/request-identity";
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
let csrf: string | null = null,
  activeContext: string | null = null,
  activeUser: string | null = null,
  refreshing: Promise<void> | null = null;
export const setAuthContext = (key: string | null, userId: string | null = null) => { activeContext = key; activeUser = userId; };
export const clearAuthMemory = () => {
  csrf = null;
  activeContext = null;
  activeUser = null;
};
async function raw<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("X-DND-Client", "web");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: "include",
      headers,
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Impossible de joindre le serveur. Vérifiez votre connexion.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.error?.code ?? "REQUEST_FAILED",
      data?.error?.message ?? "Le service est temporairement indisponible.",
    );
  if (data?.csrfToken) csrf = data.csrfToken;
  return data as T;
}
export function refreshSession() {
  if (!refreshing) {
    const work = async () => {
      await raw("/auth/csrf");
      await raw("/auth/refresh", { method: "POST", body: "{}" });
    };
    refreshing = (
      navigator.locks
        ? navigator.locks.request("dnd-web-session-refresh", work)
        : work()
    ).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  options = pinRequestIdentity(path, options, { userId: activeUser, contextKey: activeContext });
  const unsafe = ["POST", "PATCH", "DELETE", "PUT"].includes(
      options.method ?? "GET",
    ),
    publicPath = [
      "/auth/login",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/invitations/inspect",
      "/invitations/accept",
      "/partner-registration",
      "/partner-registration/inspect",
      "/partner-registration/accept",
    ].includes(path);
  if (unsafe && !publicPath && !csrf) {
    try {
      await raw("/auth/csrf");
    } catch (error) {
      if (path !== "/auth/logout") throw error;
    }
  }
  try {
    return await raw<T>(path, options);
  } catch (error) {
    if (
      retry &&
      error instanceof ApiError &&
      error.status === 401 &&
      !publicPath
    ) {
      try {
        await refreshSession();
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 401) {
          clearAuthMemory();
          window.dispatchEvent(new Event("dnd-session-invalid"));
        }
        throw refreshError;
      }
      return api<T>(path, options, false);
    }
    throw error;
  }
}
