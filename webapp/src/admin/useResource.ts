import { useEffect, useState } from "react";
import { api } from "../auth/client";
export function useResource<T>(path: string | null) {
  const [revision, setRevision] = useState(0),
    [result, setResult] = useState<{
      key: string;
      data?: T;
      error?: string;
    } | null>(null);
  const key = `${path}:${revision}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [path, key]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: !!path && result?.key !== key,
    reload: () => setRevision((v) => v + 1),
  };
}
