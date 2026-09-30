import { useState } from 'react';

import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Callout from '../components/ui/Callout.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusIndicator from '../components/ui/StatusIndicator.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import HealthScore from '../components/health/HealthScore.jsx';
import SeveritySummary from '../components/health/SeveritySummary.jsx';
import IssueCard from '../components/health/IssueCard.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatRelative } from '../lib/format.js';

export function IssuesPage() {
  const health = useApiResource(api.healthAnalysis);
  const { data, status, error, reload } = health;
  const [severityFilter, setSeverityFilter] = useState(null);

  const isBusy = status === 'loading' || status === 'refreshing';
  const collection = data?.dataCollection;
  const issues = data?.issues ?? [];
  const visibleIssues = severityFilter ? issues.filter((issue) => issue.severity === severityFilter) : issues;

  const collectionErrors = collection?.errors ?? [];
  const collectionWarnings = collection?.warnings ?? [];
  const unavailable = collection?.unavailableMetrics ?? [];

  return (
    <>
      <PageHeader
        title="Health & issues"
        subtitle="Findings from CloudWatch metrics, CloudWatch Logs and the discovered configuration. Every finding cites the observations that produced it — no model is involved at this stage."
        aside={
          <>
            {data ? (
              <StatusIndicator
                tone={
                  data.summary.status === 'healthy'
                    ? 'success'
                    : data.summary.status === 'critical'
                      ? 'danger'
                      : 'warning'
                }
                label={`${data.summary.totalIssues} findings`}
                pulse={isBusy}
              />
            ) : null}
            <Button onClick={reload} disabled={isBusy}>
              <Icon name="refresh" size={14} />
              {isBusy ? 'Analysing' : 'Re-analyse'}
            </Button>
          </>
        }
      />

      {status === 'loading' ? (
        <>
          <SkeletonCard rows={3} />
          <div className="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonCard key={index} rows={1} />
            ))}
          </div>
          <SkeletonCard rows={5} />
        </>
      ) : null}

      {status === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not reach the health API">
              {error?.message}. The backend must be running and able to reach CloudWatch.
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
          {collectionErrors.length > 0 ? (
            <Callout
              tone="danger"
              title={`CloudWatch collection failed for ${collectionErrors.length} source${collectionErrors.length === 1 ? '' : 's'}`}
              actions={
                <Button onClick={reload} disabled={isBusy}>
                  Retry
                </Button>
              }
            >
              {collectionErrors.map((entry, index) => (
                <p key={index}>
                  <strong>{entry.stage}</strong>: {entry.message}
                </p>
              ))}
              Findings that depend on the missing data were not evaluated, so this list may be incomplete.
            </Callout>
          ) : collectionWarnings.length > 0 ? (
            <Callout tone="warning" title="Partial CloudWatch data">
              {collectionWarnings.slice(0, 4).map((entry, index) => (
                <p key={index}>
                  <strong>{entry.stage ?? entry.logGroup}</strong>: {entry.message}
                </p>
              ))}
            </Callout>
          ) : null}

          <Card className="health-banner">
            <HealthScore
              score={data.summary.score}
              status={data.summary.status}
              totalIssues={data.summary.totalIssues}
              resourcesAnalysed={data.summary.resourcesAnalysed}
            />
            <div className="health-banner__meta">
              <div className="health-banner__row">
                <span className="health-banner__key">Analysis window</span>
                <span className="health-banner__value">
                  {data.window.hours}h · {data.window.start.slice(0, 16).replace('T', ' ')} to{' '}
                  {data.window.end.slice(11, 16)} UTC
                </span>
              </div>
              <div className="health-banner__row">
                <span className="health-banner__key">CloudWatch data timestamp</span>
                <span className="health-banner__value">{collection.cloudwatchTimestamp.replace('T', ' ').slice(0, 19)} UTC</span>
              </div>
              <div className="health-banner__row">
                <span className="health-banner__key">Observations collected</span>
                <span className="health-banner__value tabular">
                  {data.summary.factsCollected} facts · {collection.metricRequests} metric and{' '}
                  {collection.logRequests} log requests
                </span>
              </div>
              <div className="health-banner__row">
                <span className="health-banner__key">Detection</span>
                <span className="health-banner__value">
                  <Badge tone="outline">deterministic rules</Badge>
                  <Badge tone="outline">no AI</Badge>
                </span>
              </div>
            </div>
          </Card>

          <SeveritySummary
            counts={data.summary.countsBySeverity}
            activeSeverity={severityFilter}
            onSelect={setSeverityFilter}
          />

          {unavailable.length > 0 ? (
            <Callout tone="warning" title={`${unavailable.length} metrics had no data in this window`}>
              {unavailable.slice(0, 5).map((entry, index) => (
                <p key={index}>
                  <strong>{entry.resource}</strong> · {entry.metric} — shown as unavailable rather than zero.
                </p>
              ))}
            </Callout>
          ) : null}

          <section className="section">
            <div className="section__header">
              <h2 className="section__title">
                {severityFilter ? `${severityFilter} findings` : 'All findings'}
                {severityFilter ? (
                  <button type="button" className="section__clear" onClick={() => setSeverityFilter(null)}>
                    clear filter
                  </button>
                ) : null}
              </h2>
              <p className="section__hint">
                {data.region} · {visibleIssues.length} shown · analysed {formatRelative(data.generatedAt)}
              </p>
            </div>

            {issues.length === 0 ? (
              <Card>
                <CardBody>
                  <EmptyState icon="activity" title="No findings in this window">
                    CloudWatch returned data for {data.summary.resourcesAnalysed} resources and no rule matched.
                    That is a real result, not an absence of data — {data.summary.factsCollected} observations
                    were collected.
                  </EmptyState>
                </CardBody>
              </Card>
            ) : visibleIssues.length === 0 ? (
              <Card>
                <CardBody>
                  <EmptyState icon="activity" title={`No ${severityFilter} findings`}>
                    {issues.length} findings exist at other severities.
                  </EmptyState>
                </CardBody>
              </Card>
            ) : (
              <div className="issue-list">
                {visibleIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    resourceHealth={data.resourceHealth.find((entry) => entry.resourceId === issue.resourceId)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <Card>
              <CardHeader
                title="Resource health"
                description="Every analysed resource, including the ones with nothing wrong."
              />
              <CardBody flush>
                <div className="detail-list">
                  {data.resourceHealth.map((entry) => (
                    <div key={entry.resourceId} className="detail-row">
                      <span className="detail-row__key mono">{entry.name}</span>
                      <span className="detail-row__value">
                        {entry.issueCount === 0 ? (
                          <StatusIndicator tone="success" label="No findings" />
                        ) : (
                          <StatusIndicator
                            tone={entry.status === 'failing' ? 'danger' : 'warning'}
                            label={`${entry.issueCount} finding${entry.issueCount === 1 ? '' : 's'} · worst ${entry.worstSeverity}`}
                          />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </section>
        </>
      ) : null}
    </>
  );
}

export default IssuesPage;
