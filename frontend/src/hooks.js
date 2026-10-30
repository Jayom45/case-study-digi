import { useCallback, useEffect, useState } from "react";

/** Load data on mount / when deps change. Returns { data, loading, error, reload, setData }. */
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return load()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload, setData };
}
