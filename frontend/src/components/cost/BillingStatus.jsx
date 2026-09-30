import Badge from '../ui/Badge.jsx';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import { formatCurrency } from '../../lib/currency.js';

/**
 * What the figures are and are not. A cost dashboard that does not say "this is the
 * latest available billing data, not a live bill" invites someone to treat an
 * estimate as an invoice.
 */
export function BillingStatus({ data }) {
  const { dataStatus, periods, meta, totals, currency } = data;
  const credits = totals.recordTypes?.Credit ?? 0;

  return (
    <Card>
      <CardHeader
        title="Billing data status"
        description="Where these numbers come from, and how current they are."
      />
      <CardBody flush>
        <div className="detail-list">
          <div className="detail-row">
            <span className="detail-row__key">Source</span>
            <span className="detail-row__value">
              {meta.source} · {meta.metric} · {meta.billingScope}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-row__key">Current period</span>
            <span className="detail-row__value">
              {periods.current.label} · {periods.current.start} to {periods.current.end} ({periods.current.days}{' '}
              days elapsed)
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-row__key">Last day with charges</span>
            <span className="detail-row__value">{dataStatus.lastAvailableDate ?? '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-row__key">Real time</span>
            <span className="detail-row__value">
              <Badge tone="warning">No — AWS finalises charges over ~24h</Badge>
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-row__key">Estimated days</span>
            <span className="detail-row__value tabular">
              {dataStatus.estimatedDays} of {dataStatus.totalDays} flagged estimated by AWS
            </span>
          </div>
          {credits < 0 ? (
            <div className="detail-row">
              <span className="detail-row__key">Credits applied</span>
              <span className="detail-row__value tabular">
                {formatCurrency(credits, currency, { precise: true })} — usage is charged, then offset
              </span>
            </div>
          ) : null}
          <div className="detail-row">
            <span className="detail-row__key">Cost Explorer requests</span>
            <span className="detail-row__value tabular">
              {meta.apiRequests} this refresh ({formatCurrency(meta.requestCostUsd ?? 0, 'USD')}) · cached{' '}
              {meta.cacheTtlMinutes} min
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default BillingStatus;
