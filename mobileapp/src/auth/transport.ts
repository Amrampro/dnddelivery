export interface Credentials {
  accessToken: string;
  refreshToken: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function parseCredentials(value: unknown): Credentials {
  const v = value as Partial<Credentials> | null;
  if (
    !v ||
    typeof v.accessToken !== "string" ||
    !v.accessToken.trim() ||
    v.accessToken.length > 16384 ||
    typeof v.refreshToken !== "string" ||
    !v.refreshToken.trim() ||
    v.refreshToken.length > 16384
  )
    throw new ApiError(
      502,
      "INVALID_RESPONSE",
      "La réponse de session est invalide. Réessayez de vous connecter.",
    );
  return { accessToken: v.accessToken, refreshToken: v.refreshToken };
}
interface Storage {
  read(): Promise<Credentials | null>;
  write(value: Credentials): Promise<void>;
  remove(): Promise<void>;
}
export function createTransport({
  baseUrl,
  storage,
  fetcher = fetch,
  timeoutMs = 15000,
}: {
  baseUrl: string;
  storage: Storage;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  let credentials: Credentials | null = null,
    session = 0,
    scope = 0;
  let refreshing: Promise<void> | null = null,
    writes = 0,
    switching = false;
  let persistence: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const active = new Set<{ controller: AbortController; read: boolean }>();
  const reads = new Map<string, Promise<unknown>>();
  const publicAuth = new Set([
    "/auth/login",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/refresh",
  ]);
  function boundary() {
    scope++;
    reads.clear();
    for (const r of active) if (r.read) r.controller.abort();
  }
  function persist(work: () => Promise<void>) {
    const task = persistence.catch(() => undefined).then(work);
    persistence = task;
    return task;
  }
  function assertCurrent(version: number, context?: number) {
    if (version !== session)
      throw new ApiError(
        409,
        "SESSION_CHANGED",
        "La session a changé. Rechargez votre espace.",
      );
    if (context !== undefined && context !== scope)
      throw new ApiError(
        409,
        "CONTEXT_CHANGED",
        "L’environnement a changé. Rechargez les données de cet espace.",
      );
  }
  async function raw<T>(
    path: string,
    options: RequestInit = {},
    token: string | null | undefined = credentials?.accessToken,
    context?: number,
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw new ApiError(
        400,
        "INVALID_API_PATH",
        "Cette adresse de service n’est pas autorisée.",
      );
    if (options.signal?.aborted)
      throw new ApiError(0, "REQUEST_CANCELLED", "La requête a été annulée.");
    const version = session,
      controller = new AbortController();
    let timedOut = false;
    let interrupt!: (error: Error) => void;
    const interruption = new Promise<never>((_resolve, reject) => {
      interrupt = reject;
    });
    const interrupted = () => interrupt(new Error("Request interrupted"));
    controller.signal.addEventListener("abort", interrupted, { once: true });
    const request = {
      controller,
      read:
        !options.method ||
        ["GET", "HEAD"].includes(options.method.toUpperCase()),
    };
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) controller.abort();
    active.add(request);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const headers = new Headers(options.headers);
      headers.set("X-DND-Client", "mobile");
      if (options.body && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await Promise.race([
        fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
          ...options,
          headers,
          signal: controller.signal,
        }),
        interruption,
      ]);
      let data: unknown;
      try {
        data =
          response.status === 204
            ? undefined
            : await Promise.race([response.json(), interruption]);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new ApiError(
          502,
          "INVALID_RESPONSE",
          "La réponse du serveur est illisible. Réessayez.",
        );
      }
      assertCurrent(version, context);
      if (!response.ok) {
        const failure = data as {
          error?: { code?: unknown; message?: unknown };
        } | null;
        throw new ApiError(
          response.status,
          typeof failure?.error?.code === "string"
            ? failure.error.code
            : "REQUEST_FAILED",
          typeof failure?.error?.message === "string"
            ? failure.error.message
            : "Le service est temporairement indisponible.",
        );
      }
      return data as T;
    } catch (error) {
      assertCurrent(version, context);
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted)
        throw new ApiError(0, "REQUEST_CANCELLED", "La requête a été annulée.");
      if (timedOut)
        throw new ApiError(
          0,
          "REQUEST_TIMEOUT",
          "Le serveur met trop de temps à répondre. L’opération n’est pas confirmée ; vérifiez son état avant de réessayer.",
        );
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Impossible de joindre le serveur. Vérifiez votre connexion. L’opération n’est pas confirmée.",
      );
    } finally {
      clearTimeout(timer);
      active.delete(request);
      options.signal?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", interrupted);
    }
  }
  async function forgetSession() {
    session++;
    credentials = null;
    boundary();
    await persist(() => storage.remove());
  }
  async function invalidate(version: number) {
    if (version !== session) return;
    try {
      await forgetSession();
    } finally {
      for (const listener of listeners) listener();
    }
  }
  async function refresh() {
    if (refreshing) return refreshing;
    const version = session;
    const task = (async () => {
      if (!credentials)
        throw new ApiError(401, "UNAUTHENTICATED", "Reconnectez-vous.");
      const next = parseCredentials(
        await raw("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken: credentials.refreshToken }),
        }),
      );
      assertCurrent(version);
      await persist(async () => {
        if (version === session) await storage.write(next);
      });
      assertCurrent(version);
      credentials = next;
    })();
    refreshing = task;
    try {
      await task;
    } finally {
      if (refreshing === task) refreshing = null;
    }
  }
  async function perform<T>(
    path: string,
    options: RequestInit,
    retry: boolean,
  ): Promise<T> {
    const version = session,
      context = scope,
      issuedToken = credentials?.accessToken;
    try {
      return await raw<T>(path, options, issuedToken, context);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        !credentials ||
        publicAuth.has(path)
      )
        throw error;
      if (!retry) {
        await invalidate(version);
        throw error;
      }
      assertCurrent(version, context);
      if (issuedToken !== credentials.accessToken)
        return perform<T>(path, options, false);
      try {
        await refresh();
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401)
          await invalidate(version);
        throw failure;
      }
      assertCurrent(version, context);
      return perform<T>(path, options, false);
    }
  }
  function api<T>(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<T> {
    if (switching)
      return Promise.reject(
        new ApiError(
          409,
          "CONTEXT_CHANGING",
          "Le changement d’environnement est en cours. Patientez.",
        ),
      );
    const write =
      options.method && !["GET", "HEAD"].includes(options.method.toUpperCase());
    const key = `${session}:${scope}:${path}`,
      deduplicate = !write && Object.keys(options).length === 0;
    if (deduplicate && reads.has(key)) return reads.get(key)! as Promise<T>;
    if (write) writes++;
    const task = perform<T>(path, options, retry).finally(() => {
      if (write) writes--;
      if (reads.get(key) === task) reads.delete(key);
    });
    if (deduplicate) reads.set(key, task);
    return task;
  }
  return {
    api,
    forgetSession,
    assertCanSwitchContext() {
      if (switching || writes)
        throw new ApiError(
          409,
          "OPERATION_PENDING",
          "Terminez l’opération en cours avant de changer d’environnement.",
        );
    },
    onSessionInvalid(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async restoreCredentials() {
      const version = session,
        stored = await storage.read();
      assertCurrent(version);
      credentials = stored ? parseCredentials(stored) : null;
      return !!credentials;
    },
    async login(email: string, password: string, deviceName: string) {
      if (switching || writes)
        throw new ApiError(
          409,
          "OPERATION_PENDING",
          "Terminez l’opération en cours avant de vous connecter.",
        );
      const next = parseCredentials(
        await raw(
          "/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ email, password, deviceName }),
          },
          null,
        ),
      );
      const version = ++session;
      boundary();
      try {
        await persist(async () => {
          if (version === session) await storage.write(next);
        });
        assertCurrent(version);
        credentials = next;
      } catch (error) {
        await raw(
          "/auth/logout",
          {
            method: "POST",
            body: JSON.stringify({ refreshToken: next.refreshToken }),
          },
          next.accessToken,
        ).catch(() => undefined);
        throw error;
      }
    },
    async switchContext<T>(contextKey: string): Promise<T> {
      if (switching || writes)
        throw new ApiError(
          409,
          "OPERATION_PENDING",
          "Terminez l’opération en cours avant de changer d’environnement.",
        );
      switching = true;
      boundary();
      try {
        return await perform<T>(
          "/auth/switch-organization",
          { method: "POST", body: JSON.stringify({ contextKey }) },
          true,
        );
      } finally {
        boundary();
        switching = false;
      }
    },
    async logout() {
      if (writes || switching)
        throw new ApiError(
          409,
          "OPERATION_PENDING",
          "Terminez l’opération en cours avant de fermer la session.",
        );
      await refreshing;
      if (credentials) {
        try {
          await raw("/auth/logout", {
            method: "POST",
            body: JSON.stringify({ refreshToken: credentials.refreshToken }),
          });
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 401)) throw error;
        }
      }
      await forgetSession();
    },
  };
}
