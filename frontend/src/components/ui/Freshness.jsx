import { useEffect, useState } from 'react';

import { formatRelative } from '../../lib/format.js';

/**
 * When the data on screen was actually retrieved.
 *
 * An operations dashboard that does not say how old its numbers are invites someone to
 * act on a stale one. The label re-renders on a timer so "just now" becomes "2m ago"
 * without the section refetching.
 */
export function Freshness({ at, label = 'Updated', suffix = null, tone = 'muted' }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!at) return undefined;
    const timer = setInterval(() => tick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [at]);

  if (!at) return null;

  return (
    <span className={`freshness freshness--${tone}`} title={new Date(at).toLocaleString()}>
      <span className="freshness__dot" aria-hidden="true" />
      {label} {formatRelative(at)}
      {suffix ? <span className="freshness__suffix">{suffix}</span> : null}
    </span>
  );
}

export default Freshness;
