import { useCallback, useState } from 'react';

import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import Badge from '../ui/Badge.jsx';
import StatusIndicator from '../ui/StatusIndicator.jsx';
import useApiResource from '../../hooks/useApiResource.js';
import { useRefresh } from '../../context/RefreshContext.jsx';
import { api } from '../../lib/api.js';
import { formatRelative, formatDuration } from '../../lib/format.js';

/**
 * Lab reset.
 *
 * Presented as a routine demonstration control rather than a destructive one, because
 * that is what it is: it only writes configuration values that a recorded baseline
 * already defines, on resources the backend discovered as belonging to this lab. It
 * creates and deletes nothing.
 */
const LAB_STATE_LABEL = {
  checking: 'Checking lab state',
  broken: 'Intentionally broken',
  fixed: 'Fixed',
  partial: 'Partially fixed',
  unknown: 'Unknown',
};

export function ResetLabCard() {
  const { refreshToken, refreshAll } = useRefresh();
  const status = useApiResource(api.labStatus, { refreshToken });
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setConfirming(false);
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.resetLab();
      setResult(data);
      // The lab just changed underneath every page; pull fresh AWS state everywhere.
      refreshAll();
      status.reload();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setRunning(false);
    }
  }, [refreshAll, status]);

  const managed = status.data?.baseline?.managedAttributes ?? [];
  const alreadyAtBaseline = result?.alreadyAtBaseline;
  const automation = status.data?.automation;
  // Until the status call returns, say so. Rendering "Unknown / off" while the check is
  // still running would state the opposite of the truth.
  const loadingStatus = status.status === 'loading';
  const labState = loadingStatus ? 'checking' : (status.data?.labState ?? 'unknown');
  const pending = loadingStatus ? 'checking' : null;

  return (
    <Card className="lab-reset">
      <CardHeader
        title="Lab control"
        description="Restore the environment to its intentionally broken baseline so the walkthrough can be run again."
        actions={
          status.data?.baseline?.available ? (
            <Badge tone="outline">{managed.length} managed settings</Badge>
          ) : null
        }
      />
      <CardBody>
        {/* A quiet strip: state first, then who keeps it that way. */}
        <div className="lab-strip">
          <span className={`lab-strip__state lab-strip__state--${labState}`}>
            <span className="lab-strip__dot" />
            {LAB_STATE_LABEL[labState] ?? 'Unknown'}
          </span>

          <span className="lab-strip__divider" aria-hidden="true" />

          <span className="lab-strip__item">
            <span className="lab-strip__key">Automation</span>
            <span className="lab-strip__value">
              {pending ?? (automation?.enabled ? `every ${automation.intervalHours}h` : 'off')}
            </span>
          </span>
          <span className="lab-strip__item">
            <span className="lab-strip__key">Last check</span>
            <span className="lab-strip__value">
              {pending ??
                (automation?.lastAutonomousCheck?.completedAt
                  ? formatRelative(automation.lastAutonomousCheck.completedAt)
                  : 'not yet run')}
            </span>
          </span>
          <span className="lab-strip__item">
            <span className="lab-strip__key">Last reset</span>
            <span className="lab-strip__value">
              {pending ??
                (automation?.lastAutonomousReset?.completedAt || automation?.lastManualReset?.completedAt
                ? formatRelative(
                    [automation.lastAutonomousReset?.completedAt, automation.lastManualReset?.completedAt]
                      .filter(Boolean)
                      .sort()
                      .at(-1),
                  )
                : 'none recorded')}
            </span>
          </span>
          <span className="lab-strip__item">
            <span className="lab-strip__key">Next check</span>
            <span className="lab-strip__value">
              {pending ??
                (automation?.nextCheckEstimatedAt
                  ? new Date(automation.nextCheckEstimatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '—')}
            </span>
          </span>
          <span className="lab-strip__item">
            <span className="lab-strip__key">Managed</span>
            <span className="lab-strip__value tabular">
              {pending ??
                `${status.data?.managedResourceCount ?? '—'} settings${
                  status.data?.issueCount !== null && status.data?.issueCount !== undefined
                    ? ` · ${status.data.issueCount} issues`
                    : ''
                }`}
            </span>
          </span>
        </div>

        {!confirming && !running && !result ? (
          <div className="lab-reset__intro">
            <p className="lab-reset__text">
              A scheduled AWS check does this every {automation?.intervalHours ?? 6} hours, and you can run it
              now. Either way it compares each managed setting against the recorded baseline and writes back
              only the ones that differ — no resources are created or deleted, and no model is consulted.
            </p>
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={status.status === 'loading'}>
              <Icon name="reset" size={14} />
              Reset lab
            </Button>
          </div>
        ) : null}

        {confirming ? (
          <div className="lab-reset__confirm">
            <p className="lab-reset__confirm-text">
              This restores the AWS lab to its intentionally broken baseline for demonstration.
            </p>
            <ul className="lab-reset__managed">
              {managed.map((item) => (
                <li key={item.issueId}>
                  <span className="mono">{item.resourceName}</span>
                  <span className="lab-reset__managed-attr">{item.attribute}</span>
                  <span className="lab-reset__managed-value tabular">
                    → {Array.isArray(item.expectedValue) ? `${item.expectedValue.length} variables` : String(item.expectedValue)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="lab-reset__confirm-actions">
              <Button variant="primary" onClick={run}>
                <Icon name="reset" size={14} />
                Confirm reset
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {running ? (
          <div className="lab-reset__running">
            <StatusIndicator tone="info" label="Comparing against the baseline and restoring differences" pulse />
            <p className="lab-reset__text">
              Reading each managed setting from AWS, writing back only what differs, then re-running the
              detector to confirm the intentional issues are present again.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="lab-reset__error">
            <p className="lab-reset__error-title">Reset failed</p>
            <p className="lab-reset__text">{error.message}</p>
            <Button onClick={run}>Try again</Button>
          </div>
        ) : null}

        {result ? (
          <div className="lab-reset__result">
            <div className="lab-reset__verdict">
              <StatusIndicator
                tone={result.verification?.passed ? 'success' : 'warning'}
                label={alreadyAtBaseline ? 'Lab already at baseline' : 'Lab restored to baseline'}
              />
              <span className="lab-reset__timestamp">{formatRelative(result.completedAt)}</span>
            </div>

            <div className="lab-reset__counts">
              <span className="lab-reset__count">
                <span className="lab-reset__count-value tabular">{result.summary.resourcesEvaluated}</span>
                <span className="lab-reset__count-label">checked</span>
              </span>
              <span className="lab-reset__count">
                <span className="lab-reset__count-value tabular">{result.summary.changesApplied}</span>
                <span className="lab-reset__count-label">changed</span>
              </span>
              <span className="lab-reset__count">
                <span className="lab-reset__count-value tabular">{result.summary.alreadyAtBaseline}</span>
                <span className="lab-reset__count-label">already correct</span>
              </span>
              <span className="lab-reset__count">
                <span className="lab-reset__count-value tabular">
                  {result.verification?.issuesDetected?.filter((entry) => entry.detected).length ?? 0}
                </span>
                <span className="lab-reset__count-label">issues restored</span>
              </span>
            </div>

            {result.changesApplied.length > 0 ? (
              <ul className="lab-reset__changes">
                {result.changesApplied.map((change) => (
                  <li key={change.issueId} className="lab-reset__change">
                    <span className="lab-reset__change-resource mono">{change.resourceName}</span>
                    <span className="lab-reset__change-attr">{change.attribute}</span>
                    <span className="lab-reset__change-values">
                      <span className="lab-reset__from tabular">{String(change.beforeValue)}</span>
                      <Icon name="chevron" size={12} />
                      <span className="lab-reset__to tabular">{String(change.afterValue)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lab-reset__text">
                Every managed setting already matched the baseline, so no AWS call was made.
              </p>
            )}

            <div className="lab-reset__verification">
              {(result.verification?.issuesDetected ?? []).map((entry) => (
                <span key={entry.issueId} className="lab-reset__issue">
                  <span className={`lab-reset__dot lab-reset__dot--${entry.detected ? 'pass' : 'fail'}`} />
                  {entry.ruleId}
                </span>
              ))}
            </div>

            <Button variant="ghost" onClick={() => setResult(null)}>
              Done
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default ResetLabCard;
