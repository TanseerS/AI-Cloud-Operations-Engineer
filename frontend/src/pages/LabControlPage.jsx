import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Freshness from '../components/ui/Freshness.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import ResetLabCard from '../components/lab/ResetLabCard.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { useRefresh } from '../context/RefreshContext.jsx';
import { api } from '../lib/api.js';
import { formatDuration, formatRelative } from '../lib/format.js';

const RUN_TONE = { reset: 'success', failed: 'danger' };

/**
 * Lab control.
 *
 * The lab is deliberately broken, and a scheduled AWS check keeps it that way. This page
 * makes both facts visible and gives anyone demonstrating it a way to reset on demand.
 */
export function LabControlPage() {
  const { refreshToken } = useRefresh();
  const status = useApiResource(api.labStatus, { refreshToken });
  const { data } = status;

  const automation = data?.automation;
  const history = automation?.history ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Reproducibility"
        title="Lab control"
        subtitle="The environment is intentionally broken so the detection and remediation workflow has something real to work on. A scheduled AWS check restores that state when it drifts, and you can restore it yourself at any time."
        aside={data ? <Freshness at={new Date().toISOString()} label="Checked" /> : null}
      />

      {status.status === 'loading' ? (
        <>
          <SkeletonCard rows={3} />
          <SkeletonCard rows={4} />
        </>
      ) : null}

      <ResetLabCard />

      {data ? (
        <section className="section">
          <div className="two-column two-column--wide">
            <Card>
              <CardHeader
                title="What the baseline manages"
                description="Each setting is compared against its recorded value; only differences are written."
                actions={<Badge tone="outline">{data.managedResourceCount} settings</Badge>}
              />
              <CardBody flush>
                <div className="detail-list">
                  {(data.baseline?.managedAttributes ?? []).map((item) => {
                    const drift = (data.stateDetail?.offBaselineAttributes ?? []).find(
                      (entry) => entry.issueId === item.issueId,
                    );
                    return (
                      <div key={item.issueId} className="detail-row">
                        <span className="detail-row__key">
                          <span className="mono">{item.resourceName}</span>
                          <span className="lab-attr"> {item.attribute}</span>
                        </span>
                        <span className="detail-row__value">
                          {drift ? (
                            <span className="lab-drift">
                              <span className="lab-drift__now tabular">{String(drift.observedValue)}</span>
                              <span className="lab-drift__arrow">→</span>
                              <span className="lab-drift__target tabular">{String(drift.baselineValue)}</span>
                            </span>
                          ) : (
                            <span className="lab-ok">
                              <span className="lab-ok__dot" />
                              at baseline
                              <span className="tabular lab-ok__value">
                                {Array.isArray(item.expectedValue)
                                  ? `${item.expectedValue.length} variables`
                                  : String(item.expectedValue)}
                              </span>
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {(data.baseline?.derivedIssues ?? []).map((entry) => (
                    <div key={entry.issueId} className="detail-row">
                      <span className="detail-row__key mono">{entry.issueId}</span>
                      <span className="detail-row__value lab-derived">{entry.reason}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Automation"
                description="A scheduled AWS function, running the same reset service this page calls."
                actions={
                  <Badge tone={automation?.enabled ? 'success' : 'outline'}>
                    {automation?.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                }
              />
              <CardBody flush>
                <div className="detail-list">
                  <div className="detail-row">
                    <span className="detail-row__key">Trigger</span>
                    <span className="detail-row__value">{automation?.trigger}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__key">Interval</span>
                    <span className="detail-row__value tabular">every {automation?.intervalHours} hours</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__key">Next check</span>
                    <span className="detail-row__value">
                      {automation?.nextCheckEstimatedAt
                        ? new Date(automation.nextCheckEstimatedAt).toLocaleString()
                        : 'after the first scheduled run'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row__key">Decision method</span>
                    <span className="detail-row__value">
                      <Badge tone="outline">deterministic comparison</Badge>
                      <Badge tone="outline">no AI</Badge>
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="section">
          <Card>
            <CardHeader
              title="Recent runs"
              description="Manual and scheduled resets share one audit record, so both appear here."
            />
            <CardBody>
              {history.length === 0 ? (
                <EmptyState icon="reset" title="No runs recorded yet">
                  The first manual or scheduled reset will appear here.
                </EmptyState>
              ) : (
                <ol className="run-timeline">
                  {history.map((run, index) => (
                    <li key={`${run.completedAt}-${index}`} className="run">
                      <span className={`run__marker run__marker--${RUN_TONE[run.status] ?? 'neutral'}`} />
                      <span className="run__body">
                        <span className="run__head">
                          <Badge tone={run.trigger === 'scheduled' ? 'outline' : 'info'}>{run.trigger}</Badge>
                          <span className="run__verdict">
                            {run.alreadyAtBaseline
                              ? 'already at baseline'
                              : `${run.changesApplied.length} setting${run.changesApplied.length === 1 ? '' : 's'} restored`}
                          </span>
                          <span className="run__time">{formatRelative(run.completedAt)}</span>
                        </span>
                        {run.changesApplied.length > 0 ? (
                          <span className="run__changes">
                            {run.changesApplied.map((change) => (
                              <span key={change.issueId} className="run__change">
                                <span className="run__change-attr">{change.attribute}</span>
                                <span className="tabular">{String(change.from)}</span>
                                <span className="run__change-arrow">→</span>
                                <span className="tabular run__change-to">{String(change.to)}</span>
                              </span>
                            ))}
                          </span>
                        ) : null}
                        <span className="run__meta">
                          {run.resourcesEvaluated} evaluated · {formatDuration(run.durationMs)} ·{' '}
                          {run.verificationPassed ? 'verified' : 'verification failed'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </section>
      ) : null}
    </>
  );
}

export default LabControlPage;
