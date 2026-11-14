import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "./client";
import { useAuth } from "./AuthProvider";

/** Request data is scoped to both resource and authenticated workspace, never just its URL. */
export function useApiData<T>(url: string | null, pollMs = 0) {
  const auth = useAuth();
  const identity = `${auth.profile?.user.id ?? "anonymous"}:${auth.profile?.activeContext?.key ?? "account"}:${url}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    identity: string;
    key: string;
    data?: T;
    error?: string;
    lastSync?: string;
  }>();
  const key = `${identity}:${revision}`;
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const request = new AbortController();
    controller.current = request;
    void api<T>(url, { signal: request.signal })
      .then((data) => {
        if (live)
          setState({ identity, key, data, lastSync: new Date().toISOString() });
      })
      .catch((error) => {
        if (live && !request.signal.aborted)
          setState((previous) => ({
            identity,
            key,
            data:
              ![401, 403, 404].includes(error.status) &&
              previous?.identity === identity
                ? previous.data
                : undefined,
            lastSync:
              previous?.identity === identity ? previous.lastSync : undefined,
            error: error.message,
          }));
      });
    return () => {
      live = false;
      request.abort();
    };
  }, [url, identity, key]);
  const focusedBefore = useRef(false);
  const enabled = !!url;
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !pollMs) { focusedBefore.current = false; return; }
      if (focusedBefore.current) reload();
      else focusedBefore.current = true;
      const timer =
        pollMs
          ? setInterval(() => {
              if (AppState.currentState === "active") reload();
            }, pollMs)
          : null;
      const listener = AppState.addEventListener("change", (value) => {
        if (value === "active") reload();
      });
      return () => {
        if (timer) clearInterval(timer);
        listener.remove();
        controller.current?.abort();
      };
    }, [enabled, pollMs, reload]),
  );
  return {
    data: state?.identity === identity ? state.data : undefined,
    error: state?.identity === identity ? state.error : undefined,
    lastSync: state?.identity === identity ? state.lastSync : undefined,
    syncing: !!url && state?.key !== key,
    reload,
  };
}
