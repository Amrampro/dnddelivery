import { useEffect, useState } from "react";
import { api, ApiError } from "../auth/client";
export function useDeliveryData<T>(url: string | null) {
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      url: string;
      key: string;
      data?: T;
      error?: string;
      lastSync?: string;
    }>(),
    key = `${url}:${revision}`;
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api<T>(url, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ url, key, data, lastSync: new Date().toISOString() });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            url,
            key,
            data: previous?.url === url && !(e instanceof ApiError && [401,403,404].includes(e.status)) ? previous.data : undefined,
            lastSync: previous?.url === url && !(e instanceof ApiError && [401,403,404].includes(e.status)) ? previous.lastSync : undefined,
            error: e.message,
          }));
      });
    return () => controller.abort();
  }, [url, key]);
  useEffect(() => {
    if (!url) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRevision((n) => n + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [url]);
  return {
    data: state?.url === url ? state.data : undefined,
    error: state?.url === url ? state.error : undefined,
    lastSync: state?.url === url ? state.lastSync : undefined,
    syncing: !!url && state?.key !== key,
    reload: () => setRevision((n) => n + 1),
  };
}
