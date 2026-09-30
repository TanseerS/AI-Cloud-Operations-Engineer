import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import { formatCurrency, formatPercent } from '../../lib/currency.js';

/**
 * The services worth looking at first. Direction is carried by an arrow and a word as
 * well as colour, so the signal survives a greyscale print or a colourblind reader.
 */
function Delta({ changePercent, currency, change }) {
  if (changePercent === null || changePercent === undefined) {
    return <span className="driver__delta driver__delta--none">No prior period</span>;
  }

  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const tone = direction === 'up' ? 'danger' : direction === 'down' ? 'success' : 'flat';

  return (
    <span className={`driver__delta driver__delta--${tone}`}>
      <span aria-hidden="true">{direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'}</span>
      {formatPercent(changePercent, { signed: true })}
      <span className="driver__delta-abs">
        {change > 0 ? '+' : ''}
        {formatCurrency(change, currency, { precise: Math.abs(change) < 0.01 })}
      </span>
    </span>
  );
}

export function TopDrivers({ drivers, currency, total }) {
  if (!drivers.length) return null;

  return (
    <div className="driver-grid">
      {drivers.map((driver, index) => (
        <Card key={driver.serviceKey} className="driver">
          <div className="driver__top">
            <span className="driver__rank">#{index + 1}</span>
            {driver.discoveryService ? (
              <span className="driver__linked">
                <Icon name="server" size={12} />
                {driver.discoveryService}
              </span>
            ) : null}
          </div>
          <p className="driver__name" title={driver.service}>
            {driver.service}
          </p>
          <p className="driver__cost tabular">
            {formatCurrency(driver.cost, currency, { precise: driver.cost < 0.01 })}
          </p>
          <div className="driver__meter" aria-hidden="true">
            <span
              className="driver__meter-fill"
              style={{ width: `${total > 0 ? Math.max((driver.cost / total) * 100, 1) : 0}%` }}
            />
          </div>
          <p className="driver__share tabular">{formatPercent(driver.percentage)} of period cost</p>
          <Delta changePercent={driver.changePercent} change={driver.change} currency={currency} />
        </Card>
      ))}
    </div>
  );
}

export default TopDrivers;
