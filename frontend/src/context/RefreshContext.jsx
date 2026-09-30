import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const RefreshContext = createContext({ refreshToken: 0, refreshAll: () => {} });

/**
 * A counter that data-loading pages watch.
 *
 * A lab reset changes AWS underneath whatever the dashboard is showing, so the pages
 * need a way to be told their data is stale. Bumping this re-runs every hook that
 * observes it, rather than each page inventing its own refresh path.
 */
export function RefreshProvider({ children }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshAll = useCallback(() => setRefreshToken((value) => value + 1), []);
  const value = useMemo(() => ({ refreshToken, refreshAll }), [refreshToken, refreshAll]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  return useContext(RefreshContext);
}

export default RefreshContext;
