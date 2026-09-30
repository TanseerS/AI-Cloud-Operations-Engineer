import { useState } from 'react';
import { Link } from 'react-router-dom';

import { formatCurrency, formatPercent } from '../../lib/currency.js';

/**
 * Cost by service, sorted descending.
 *
 * Horizontal bars rather than a donut: twelve services with a 70/18/11 split and a
 * long tail of fractions of a cent would be unreadable as angles, and the names are
 * long enough to need a left-aligned label anyway.
 *
 * One measure, one hue. The bars encode magnitude, not identity, so a categorical
 * palette here would imply a distinction that does not exist.
 *
 * A service that maps onto discovered resources links through to them. That mapping is a
 * name correspondence, not a causal claim: it says these resources are the ones billed
 * under this line, not that any particular one caused the charge.
 */
export function ServiceBreakdown({ services, currency }) {
  const [hovered, setHovered] = useState(null);

  const visible = services.filter((entry) => entry.cost > 0);
  if (!visible.length) return null;

  const max = Math.max(...visible.map((entry) => entry.cost));

  return (
    <ul className="breakdown">
      {visible.map((entry) => {
        const width = max > 0 ? Math.max((entry.cost / max) * 100, 0.8) : 0;
        const isHovered = hovered === entry.serviceKey;

        return (
          <li
            key={entry.serviceKey}
            className="breakdown__row"
            onMouseEnter={() => setHovered(entry.serviceKey)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="breakdown__name" title={entry.service}>
              <span className="breakdown__label">{entry.service}</span>
              {entry.discoveryService ? (
                <Link
                  className="breakdown__linked"
                  to={`/infrastructure#${entry.discoveryService}`}
                  title={`This billing line maps to discovered ${entry.discoveryService} resources`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {entry.discoveryService}
                </Link>
              ) : null}
            </span>

            <span className="breakdown__track">
              <span className="breakdown__bar" style={{ width: `${width}%` }} />
            </span>

            <span className="breakdown__value tabular">
              {formatCurrency(entry.cost, currency, { precise: entry.cost < 0.01 })}
            </span>
            <span className="breakdown__percent tabular">{formatPercent(entry.percentage)}</span>

            {isHovered ? (
              <span className="breakdown__tooltip" role="status">
                {formatCurrency(entry.cost, currency, { precise: true })} · {formatPercent(entry.percentage)} of
                period
                {entry.previousCost !== null ? (
                  <>
                    {' '}
                    · previous {formatCurrency(entry.previousCost, currency, { precise: true })}
                    {entry.changePercent !== null ? ` (${formatPercent(entry.changePercent, { signed: true })})` : ''}
                  </>
                ) : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default ServiceBreakdown;
