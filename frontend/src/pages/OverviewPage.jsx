import { Link } from 'react-router-dom';

import Hero from '../components/layout/Hero.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Callout from '../components/ui/Callout.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusIndicator from '../components/ui/StatusIndicator.jsx';
import Freshness from '../components/ui/Freshness.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import { SEVERITY_ORDER, SEVERITY_TONE } from '../components/health/severity.js';
import useApiResource from '../hooks/useApiResource.js';
import { useRefresh } from '../context/RefreshContext.jsx';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/currency.js';
import { EMPTY } from '../lib/format.js';

const LAB_STATE = {
  broken: { tone: 'success', label: 'Intentionally broken' },
  fixed: { tone: 'warning', label: 'Fixed' },
  partial: { tone: 'warning', label: 'Partially fixed' },
  unknown: { tone: 'neutral', label: 'Unknown' },
};

const HEALTH_TONE = { healthy: 'success', degraded: 'warning', unhealthy: 'warning', critical: 'danger' };

/**
 * A summary tile that links somewhere useful.
 *
 * Every number here is a door: a count of issues is only interesting if you can reach
 * the issues. The whole tile is the link, so the target stays large.
 */
function SummaryTile({ to, label, icon, value, hint, tone, unavailable }) {
  const body = (
    <>
      <span className="summary__label">
        <Icon name={icon} size={13} />
        {label}
      </span>
      <span className={`summary__value tabular${tone ? ` summary__value--${tone}` : ''}`}>
        {unavailable ? EMPTY : value}
      </span>
      <span className="summary__hint">{unavailable ? 'Unavailable' : hint}</span>
    </>
  );

  return to ? (
    <Link className="card card--interactive summary summary--link" to={to}>
      {body}
      <Icon name="chevron" size={13} className="summary__chevron" />
    </Link>
  ) : (
    <div className="card summary">{body}</div>
  );
}

export function OverviewPage() {
  const { refreshToken } = useRefresh();
  const overview = useApiResource(api.overview, { refreshToken });
  const { data, status, error, reload } = overview;

  const busy = status === 'loading' || status === 'refreshing';
  const severity = data?.health?.countsBySeverity ?? {};
  const criticalAndHigh = (severity.critical ?? 0) + (severity.high ?? 0);
  const labState = LAB_STATE[data?.lab?.state] ?? LAB_STATE.unknown;

  return (
    <>
      <Hero
        region={data?.region}
        resourceCount={data?.resources?.available ? data.resources.total : null}
        issueCount={data?.health?.available ? data.health.totalIssues : null}
        labLabel={data ? labState.label : null}
        unavailable={!data}
      />

      <div className="page-header page-header--compact">
        <p className="page-header__eyebrow-note">
          Every figure below is read from AWS when this page loads.
        </p>
        <div className="page-header__aside">
          {data ? <Freshness at={data.generatedAt} /> : null}
          <Button onClick={reload} disabled={busy}>
            <Icon name="refresh" size={14} />
            {busy ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>

      {status === 'loading' ? (
        <>
          <div className="summary-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonCard key={index} rows={2} />
            ))}
          </div>
          <SkeletonCard rows={4} />
        </>
      ) : null}

      {status === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not reach the API">
              {error?.message}. The backend must be running and able to reach AWS.
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

      {data ? (
        <>
          {data.partial ? (
            <Callout
              tone="warning"
              title={`${data.unavailableSections.length} section(s) could not be loaded`}
              actions={
                <Button onClick={reload} disabled={busy}>
                  Retry
                </Button>
              }
            >
              {data.unavailableSections.map((entry) => (
                <p key={entry.section}>
                  <strong>{entry.section}</strong>: {entry.error}
                </p>
              ))}
              Everything else below is current.
            </Callout>
          ) : null}

          <div className="summary-grid">
            <SummaryTile
              to="/infrastructure"
              label="AWS resources"
              icon="server"
              value={data.resources.total}
              hint={`${data.resources.servicesDetected} services discovered`}
              unavailable={!data.resources.available}
            />
            <SummaryTile
              to="/cost"
              label="Month to date"
              icon="cost"
              value={formatCurrency(data.cost.usageCost, data.cost.currency)}
              hint={
                data.cost.changePercent !== null
                  ? `${formatPercent(data.cost.changePercent, { signed: true })} vs previous period · not real time`
                  : 'usage cost · billing data is delayed'
              }
              unavailable={!data.cost.available || !data.cost.dataAvailable}
            />
            <SummaryTile
              to="/issues"
              label="Active issues"
              icon="issues"
              value={data.health.totalIssues}
              hint={`across ${data.health.resourcesWithIssues} resources`}
              unavailable={!data.health.available}
            />
            <SummaryTile
              to="/issues"
              label="Critical & high"
              icon="issues"
              value={criticalAndHigh}
              tone={criticalAndHigh > 0 ? 'danger' : undefined}
              hint={criticalAndHigh > 0 ? 'need attention first' : 'none outstanding'}
              unavailable={!data.health.available}
            />
            <SummaryTile
              to="/remediation"
              label="Remediation"
              icon="remediation"
              value={
                data.remediation.total === 0
                  ? 'None planned'
                  : `${data.remediation.verified} / ${data.remediation.executable}`
              }
              hint={
                data.remediation.total === 0
                  ? 'build plans from detected issues'
                  : `${data.remediation.awaitingApproval} awaiting approval`
              }
              unavailable={!data.remediation.available}
            />
            <SummaryTile
              to="/lab"
              label="Lab state"
              icon="reset"
              value={labState.label}
              tone={labState.tone === 'success' ? undefined : 'warning'}
              hint={
                data.lab.automationEnabled
                  ? `auto-checked every ${data.lab.intervalHours}h`
                  : 'automation off'
              }
              unavailable={!data.lab.available}
            />
          </div>

          <section className="section">
            <div className="two-column two-column--wide">
              <Card>
                <CardHeader
                  title="Environment health"
                  description="Deterministic findings from CloudWatch metrics, logs and configuration."
                  actions={data.health.available ? <Freshness at={data.health.retrievedAt} label="" /> : null}
                />
                <CardBody>
                  {!data.health.available ? (
                    <EmptyState icon="plug" title="Health data unavailable">
                      {data.health.error}
                    </EmptyState>
                  ) : (
                    <>
                      <div className="overview-health">
                        <div className="overview-health__score">
                          <span className={`overview-health__value tabular overview-health__value--${HEALTH_TONE[data.health.status] ?? 'neutral'}`}>
                            {data.health.score}
                          </span>
                          <span className="overview-health__label">health score</span>
                        </div>
                        <div className="overview-health__severities">
                          {SEVERITY_ORDER.filter((name) => name !== 'info').map((name) => (
                            <Link key={name} to="/issues" className="overview-sev">
                              <span className={`overview-sev__dot overview-sev__dot--${SEVERITY_TONE[name]}`} />
                              <span className="overview-sev__count tabular">{severity[name] ?? 0}</span>
                              <span className="overview-sev__label">{name}</span>
                            </Link>
                          ))}
                        </div>
                      </div>

                      {data.health.topIssues.length > 0 ? (
                        <ul className="overview-issues">
                          {data.health.topIssues.map((issue) => (
                            <li key={issue.id} className="overview-issue">
                              <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge>
                              <Link className="overview-issue__title" to="/issues">
                                {issue.title}
                              </Link>
                              <Link
                                className="overview-issue__resource mono"
                                to={`/architecture?focus=${encodeURIComponent(issue.resourceId ?? '')}`}
                                title="Show this resource in the architecture"
                              >
                                {issue.resource}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="overview-note">
                          No findings in the last {data.health.windowHours}h window.
                        </p>
                      )}

                      {data.health.metricsUnavailable > 0 ? (
                        <p className="overview-note">
                          {data.health.metricsUnavailable} metrics had no data in this window and are reported
                          as unavailable rather than zero.
                        </p>
                      ) : null}
                    </>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Spend"
                  description="Account-wide, from Cost Explorer."
                  actions={
                    data.cost.available ? <Badge tone="warning">not real time</Badge> : null
                  }
                />
                <CardBody>
                  {!data.cost.available || !data.cost.dataAvailable ? (
                    <EmptyState icon="cost" title="Cost data unavailable">
                      {data.cost.error ?? 'Cost Explorer returned no data for this account.'}
                    </EmptyState>
                  ) : (
                    <div className="detail-list">
                      <div className="detail-row">
                        <span className="detail-row__key">Usage cost · {data.cost.period}</span>
                        <span className="detail-row__value tabular">
                          {formatCurrency(data.cost.usageCost, data.cost.currency)}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-row__key">Actually billed</span>
                        <span className="detail-row__value tabular">
                          {formatCurrency(data.cost.netCost, data.cost.currency)}
                        </span>
                      </div>
                      {data.cost.topService ? (
                        <div className="detail-row">
                          <span className="detail-row__key">Largest driver</span>
                          <span className="detail-row__value">
                            {data.cost.topService.service} ·{' '}
                            <span className="tabular">{formatPercent(data.cost.topService.percentage)}</span>
                          </span>
                        </div>
                      ) : null}
                      <div className="detail-row">
                        <span className="detail-row__key">Latest billing day</span>
                        <span className="detail-row__value">{data.cost.lastAvailableDate ?? EMPTY}</span>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </section>

          <section className="section">
            <Card>
              <CardHeader
                title="Where to go next"
                description="The environment tells one story; each step of it has its own view."
              />
              <CardBody>
                <ol className="journey">
                  {[
                    { to: '/architecture', title: 'Architecture', body: 'What exists and how it connects' },
                    { to: '/cost', title: 'Costs', body: 'What it spends and where' },
                    { to: '/issues', title: 'Health & issues', body: 'What is wrong, with evidence' },
                    { to: '/ai', title: 'AI analysis', body: 'Root cause reasoning over that evidence' },
                    { to: '/remediation', title: 'Remediation', body: 'Approve a fix, apply it, verify it' },
                    { to: '/lab', title: 'Lab control', body: 'Reset the environment and start again' },
                  ].map((step, index) => (
                    <li key={step.to} className="journey__step">
                      <Link className="journey__link" to={step.to}>
                        <span className="journey__index tabular">{index + 1}</span>
                        <span className="journey__body">
                          <span className="journey__title">{step.title}</span>
                          <span className="journey__text">{step.body}</span>
                        </span>
                        <Icon name="chevron" size={14} className="journey__chevron" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          </section>

          <p className="overview-footnote">
            <StatusIndicator tone="success" label="No AWS credentials reach the browser" /> · every figure is
            read from AWS by the backend · assembled in {(data.durationMs / 1000).toFixed(1)}s
          </p>
        </>
      ) : null}
    </>
  );
}

export default OverviewPage;
