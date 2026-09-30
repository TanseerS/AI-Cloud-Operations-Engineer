import { useCallback, useState } from 'react';

import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import StatTile from '../components/ui/StatTile.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Callout from '../components/ui/Callout.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusIndicator from '../components/ui/StatusIndicator.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import PlanCard, { RecommendationOnlyCard } from '../components/remediation/PlanCard.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatRelative } from '../lib/format.js';

/**
 * Planning only. Nothing on this page executes an AWS change - approving a plan moves it
 * to "ready for execution" and stops there, which is also what the backend enforces.
 */
export function RemediationPage() {
  const stored = useApiResource(api.remediationPlans);
  const [planning, setPlanning] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [executingId, setExecutingId] = useState(null);
  const [lastExecution, setLastExecution] = useState(null);
  const [error, setError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const buildPlans = useCallback(async () => {
    setPlanning(true);
    setError(null);
    try {
      const { data } = await api.planRemediation();
      setLastRun(data);
      stored.reload();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setPlanning(false);
    }
  }, [stored]);

  const approve = useCallback(
    async (id) => {
      setApprovingId(id);
      setError(null);
      try {
        await api.approvePlan(id);
        stored.reload();
      } catch (requestError) {
        setError(requestError);
      } finally {
        setApprovingId(null);
      }
    },
    [stored],
  );

  const execute = useCallback(
    async (id) => {
      setExecutingId(id);
      setError(null);
      setLastExecution(null);
      try {
        const { data } = await api.executePlan(id);
        setLastExecution(data);
        stored.reload();
      } catch (requestError) {
        setError(requestError);
      } finally {
        setExecutingId(null);
      }
    },
    [stored],
  );

  const plans = stored.data?.plans ?? [];
  const executable = plans.filter((plan) => plan.planType === 'executable');
  const advisory = plans.filter((plan) => plan.planType !== 'executable');
  const approved = executable.filter((plan) => plan.status === 'approved');
  const awaiting = executable.filter((plan) => plan.status === 'proposed');
  const verified = executable.filter((plan) => plan.status === 'verified');
  const failed = executable.filter((plan) => plan.status === 'failed');
  const guardrails = lastRun?.guardrails;

  const loading = stored.status === 'loading';

  return (
    <>
      <PageHeader
        title="Remediation"
        subtitle="Detected issues turned into single, reversible AWS changes. Every target is re-derived from AWS by the backend — the browser cannot name a resource or an action. Approving a plan marks it ready; it does not execute anything."
        aside={
          <>
            {plans.length > 0 ? (
              <StatusIndicator
                tone={awaiting.length > 0 ? 'warning' : 'success'}
                label={`${verified.length} verified · ${approved.length} ready · ${awaiting.length} awaiting`}
                pulse={planning}
              />
            ) : null}
            <Button variant="primary" onClick={buildPlans} disabled={planning}>
              <Icon name="refresh" size={14} />
              {planning ? 'Planning' : plans.length ? 'Re-plan' : 'Build plans'}
            </Button>
          </>
        }
      />

      <div className="guardrail-strip">
        <Icon name="server" size={14} />
        <span className="guardrail-strip__text">
          Targets restricted to{' '}
          <code>Project=ai-cloud-operations-engineer</code>, <code>Environment=lab</code>,{' '}
          <code>ManagedBy=aicoe</code> in{' '}
          <code>{guardrails?.region ?? stored.data?.region ?? 'us-east-1'}</code>
        </span>
        <Badge tone="success">no execution in this stage</Badge>
      </div>

      {executingId ? (
        <Callout tone="info" title="Applying the change to AWS">
          Re-verifying the target, capturing the current configuration, applying the approved operation,
          then re-running the detector against live CloudWatch. This takes up to a minute.
        </Callout>
      ) : null}

      {lastExecution ? (
        <Callout
          tone={
            lastExecution.outcome === 'verified'
              ? 'info'
              : lastExecution.outcome === 'already_verified' || lastExecution.outcome === 'already_in_desired_state'
                ? 'info'
                : 'warning'
          }
          title={
            {
              verified: 'Remediation verified',
              already_verified: 'Already verified — nothing was executed again',
              already_in_desired_state: 'Already in the desired state — no AWS change was made',
              verification_failed: 'AWS accepted the change, but the issue is still detected',
              rejected: 'Execution rejected by the safety gate',
              aws_error: 'The AWS operation failed',
            }[lastExecution.outcome] ?? 'Execution finished'
          }
        >
          {lastExecution.message}
        </Callout>
      ) : null}

      {error ? (
        <Callout
          tone="danger"
          title={error.code === 'caller_supplied_target' ? 'Request rejected by the safety gate' : 'Request failed'}
          actions={
            <Button onClick={buildPlans} disabled={planning}>
              Retry
            </Button>
          }
        >
          {error.message}
        </Callout>
      ) : null}

      {loading ? (
        <>
          <div className="stat-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonCard key={index} rows={1} />
            ))}
          </div>
          <SkeletonCard rows={5} />
        </>
      ) : null}

      {stored.status === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not reach the remediation API">
              {stored.error?.message}. The backend must be running.
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={stored.reload}>
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {!loading && stored.data && plans.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon="remediation" title="No plans built yet">
              Planning re-discovers every resource from AWS and maps detected issues onto the backend's
              allowlisted actions. Run it to see what can be fixed safely.
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={buildPlans} disabled={planning}>
                <Icon name="refresh" size={14} />
                Build plans
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {plans.length > 0 ? (
        <>
          <div className="stat-grid">
            <StatTile label="Verified" icon="activity" value={verified.length} hint="Applied and confirmed resolved" />
            <StatTile label="Ready to execute" icon="remediation" value={approved.length} hint="Approved, not yet applied" />
            <StatTile label="Awaiting approval" icon="issues" value={awaiting.length} hint="Reviewed but not approved" />
            <StatTile
              label={failed.length ? 'Failed' : 'Recommendation only'}
              icon={failed.length ? 'issues' : 'cloud'}
              value={failed.length || advisory.length}
              hint={failed.length ? 'Applied but not resolved' : 'No safe automated action'}
            />
          </div>

          {lastRun?.ai?.used === false ? (
            <Callout tone="info" title="Plans built without Bedrock reasoning">
              {lastRun.ai.reason} The actions and parameters are unaffected — they come from the backend
              registry either way.
            </Callout>
          ) : null}

          <section className="section">
            <div className="section__header">
              <h2 className="section__title">Executable plans</h2>
              <p className="section__hint">
                {stored.data.generatedAt ? `Loaded ${formatRelative(stored.data.generatedAt)}` : null}
              </p>
            </div>
            {executable.length === 0 ? (
              <Card>
                <CardBody>
                  <EmptyState icon="activity" title="No issue maps to an automated fix">
                    Every current finding needs a human decision. They are listed below.
                  </EmptyState>
                </CardBody>
              </Card>
            ) : (
              <div className="plan-list">
                {executable.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onApprove={approve}
                    onExecute={execute}
                    approving={approvingId === plan.id}
                    executing={executingId === plan.id}
                  />
                ))}
              </div>
            )}
          </section>

          {advisory.length > 0 ? (
            <section className="section">
              <div className="section__header">
                <h2 className="section__title">Recommendation only</h2>
                <p className="section__hint">No allowlisted action maps to these</p>
              </div>
              <div className="plan-list">
                {advisory.map((plan) => (
                  <RecommendationOnlyCard key={plan.id} plan={plan} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default RemediationPage;
