import { createContext, useContext } from 'react';

import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';

const HealthContext = createContext(null);

/**
 * One health poll for the whole app. The shell and the overview page read the same
 * result, so the dashboard never contradicts itself or double-polls the API.
 */
export function HealthProvider({ children }) {
  const health = useApiResource(api.health);
  return <HealthContext.Provider value={health}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  const value = useContext(HealthContext);
  if (!value) throw new Error('useHealth must be used within a HealthProvider');
  return value;
}

export default HealthContext;
