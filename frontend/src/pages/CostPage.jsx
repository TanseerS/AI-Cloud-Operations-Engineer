import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Callout from '../components/ui/Callout.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusIndicator from '../components/ui/StatusIndicator.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import TrendChart from '../components/cost/TrendChart.jsx';
import ServiceBreakdown from '../components/cost/ServiceBreakdown.jsx';
import TopDrivers from '../components/cost/TopDrivers.jsx';
import BillingStatus from '../components/cost/BillingStatus.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/currency.js';
import { formatRelative } from '../lib/format.js';

/**
 * The headline. Two figures rather than one, because with credits applied they answer
 * different questions and either alone would mislead.
 */
function HeadlineCost({ data }) {
  const { totals, currency, periods, comparison } = data;
  const direction = comparison.available ? comparison.direction : null;
  const tone = direction === 'up' ? 'danger' : direction === 'down' ? 'success' : 'flat';

  return (
    <Card className="headline">
      <div className="headline__primary">
        <p className="headline__label">Usage cost · {periods.current.label}</p>
        <p className="headline__value tabular">{formatCurrency(totals.usageCost, currency)}</p>
        <p className="headline__sub">
          What the running resources cost at list rate, {periods.current.days} days elapsed
        </p>

        {comparison.available ? (
          <p className={`headline__delta headline__delta--${tone}`}>
            <span aria-hidden="true">
              {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'}
            </span>
            {formatPercent(comparison.percentChange, { signed: true })}
            <span className="headline__delta-abs">
              {comparison.absoluteChange > 0 ? '+' : ''}
              {formatCurrency(comparison.absoluteChange, currency)} vs {comparison.basis}
            </span>
          </p>
        ) : (
          <p className="headline__delta headline__delta--none">{comparison.reason}</p>
        )}
      </div>

      <div className="headline__secondary">
        <p className="headline__label">Actually billed</p>
        <p className="headline__value headline__value--secondary tabular">
          {totals.netCost === null ? '—' : formatCurrency(totals.netCost, currency)}
        </p>
        <p className="headline__sub">After credits, discounts and tax</p>
        <div className="headline__records">
          {Object.entries(totals.recordTypes ?? {})
            .filter(([, value]) => value !== 0)
            .map(([name, value]) => (
              <span key={name} className="headline__record">
                <span className="headline__record-name">{name}</span>
                <span className="headline__record-value tabular">
                  {formatCurrency(value, currency, { precise: Math.abs(value) < 0.01 })}
                </span>
              </span>
            ))}
        </div>
      </div>
    </Card>
  );
}

export function CostPage() {
  const cost = useApiResource(api.costs);
  const { data, status, error, reload } = cost;
  const isBusy = status === 'loading' || status === 'refreshing';

  const hasSpend = data?.available && data.totals.usageCost > 0;
  const blockingErrors = data?.errors?.filter((entry) => entry.query === 'current-period-daily') ?? [];
  const partialErrors = data?.errors?.filter((entry) => entry.query !== 'current-period-daily') ?? [];

  return (
    <>
      <PageHeader
        title="Cost"
        subtitle="Account-wide AWS spend from Cost Explorer. Figures are the latest available billing data, not a live bill."
        aside={
          <>
            {data?.available ? (
              <StatusIndicator
                tone={data.partial ? 'warning' : 'success'}
                label={data.meta.cached ? 'Cached billing data' : 'Fresh billing data'}
                pulse={isBusy}
              />
            ) : null}
            <Button onClick={reload} disabled={isBusy}>
              <Icon name="refresh" size={14} />
              {isBusy ? 'Loading' : 'Refresh'}
            </Button>
          </>
        }
      />

      {status === 'loading' ? (
        <>
          <SkeletonCard rows={3} />
          <div className="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonCard key={index} rows={2} />
            ))}
          </div>
          <SkeletonCard rows={6} />
        </>
      ) : null}

      {status === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not reach the cost API">
              {error?.message}. The backend must be running and able to reach AWS Cost Explorer.
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={reload}>
                <Icon name="refresh" size={14} />
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {data && !data.available ? (
        <Card>
          <CardBody>
            <EmptyState icon="cost" title="Cost Explorer returned no data">
              {blockingErrors[0]?.message ??
                'AWS did not return billing data for this account. Cost Explorer must be enabled and the caller needs ce:GetCostAndUsage.'}
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={reload}>
                <Icon name="refresh" size={14} />
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {data?.available ? (
        <>
          {partialErrors.length > 0 ? (
            <Callout
              tone="warning"
              title={`Partial billing data: ${partialErrors.length} of 3 Cost Explorer queries failed`}
              actions={
                <Button onClick={reload} disabled={isBusy}>
                  Retry
                </Button>
              }
            >
              {partialErrors.map((entry) => (
                <p key={entry.query}>
                  <strong>{entry.query}</strong>: {entry.message}
                </p>
              ))}
              Everything below comes from the queries that succeeded.
            </Callout>
          ) : null}

          <HeadlineCost data={data} />

          {!hasSpend ? (
            <Callout tone="info" title="No billable usage recorded in this period">
              Cost Explorer returned data, but every charge in {data.periods.current.label} is zero.
            </Callout>
          ) : (
            <>
              <section className="section">
                <div className="section__header">
                  <h2 className="section__title">Top cost drivers</h2>
                  <p className="section__hint">Largest contributors this period</p>
                </div>
                <TopDrivers
                  drivers={data.topDrivers}
                  currency={data.currency}
                  total={data.totals.usageCost}
                />
              </section>

              <section className="section">
                <div className="two-column two-column--wide">
                  <Card>
                    <CardHeader
                      title="Daily cost trend"
                      description={`Usage cost per day across ${data.daily.length} days`}
                      actions={<Badge tone="outline">{data.currency}</Badge>}
                    />
                    <CardBody>
                      <TrendChart
                        data={data.daily}
                        currency={data.currency}
                        lastAvailableDate={data.dataStatus.lastAvailableDate}
                      />
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Cost by service"
                      description={`${data.services.filter((entry) => entry.cost > 0).length} services with charges`}
                    />
                    <CardBody>
                      <ServiceBreakdown services={data.services} currency={data.currency} />
                    </CardBody>
                  </Card>
                </div>
              </section>
            </>
          )}

          <section className="section">
            <BillingStatus data={data} />
            {data.warnings?.length ? (
              <ul className="billing-notes">
                {data.warnings.map((warning, index) => (
                  <li key={index}>{warning.message}</li>
                ))}
              </ul>
            ) : null}
            <p className="section__hint" style={{ marginTop: 'var(--space-3)' }}>
              Generated {formatRelative(data.generatedAt)}
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

export default CostPage;
