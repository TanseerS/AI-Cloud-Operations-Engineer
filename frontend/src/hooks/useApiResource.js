import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads one API resource and exposes the four states a dashboard actually needs:
 * loading, data, error, and how long the call took.
 */
export function useApiResource(loader) {
  const [state, setState] = useState({
    status: 'loading',
    data: null,
    error: null,
    latencyMs: null,
    checkedAt: null,
  });

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading' }));
    try {
      const { data, latencyMs } = await loaderRef.current();
      setState({
        status: 'success',
        data,
        error: null,
        latencyMs,
        checkedAt: new Date(),
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error,
        latencyMs: null,
        checkedAt: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export default useApiResource;
