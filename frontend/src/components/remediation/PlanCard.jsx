import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import StatusIndicator from '../ui/StatusIndicator.jsx';
import StateDiff from './StateDiff.jsx';
import { SEVERITY_TONE } from '../health/severity.js';
import { formatValue, humanizeKey } from '../../lib/format.js';

const RISK_TONE = { low: 'success', medium: 'warning', high: 'danger' };

const STATUS_PRESENTATION = {
  proposed: { tone: 'info', label: 'Awaiting approval' },
  approved: { tone: 'success', label: 'Approved — ready for execution' },
  executed: { tone: 'info', label: 'Executed' },
  verified: { tone: 'success', label: 'Verified' },
  failed: { tone: 'danger', label: 'Failed' },
};

export function PlanCard({ plan, onApprove, approving }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  const severityTone = SEVERITY_TONE[plan.severity] ?? 'neutral';
  const status = STATUS_PRESENTATION[plan.status] ?? { tone: 'neutral', label: plan.status };
  const isApproved = plan.status === 'approved';

  return (
    <article className={`plan plan--${severityTone}${isApproved ? ' plan--approved' : ''}`}>
      <header className="plan__header">
        <span className="plan__rail" aria-hidden="true" />
        <div className="plan__identity">
          <div className="plan__badges">
            <Badge tone={severityTone}>{plan.severity}</Badge>
            <Badge tone={RISK_TONE[plan.risk] ?? 'outline'}>{plan.risk} risk</Badge>
            <span className="plan__resource mono">{plan.resourceName}</span>
          </div>
          <h3 className="plan__action">{plan.action}</h3>
          <p className="plan__issue">Addresses: {plan.issue}</p>
        </div>
        <div className="plan__status">
          <StatusIndicator tone={status.tone} label={status.label} />
        </div>
      </header>

      <div className="plan__body">
        <StateDiff currentState={plan.currentState} desiredState={plan.desiredState} />
        <p className="plan__rationale">{plan.rationale}</p>

        {plan.warnings?.length ? (
          <div className="plan__warnings">
            {plan.warnings.map((warning, index) => (
              <p key={index}>
                <Icon name="issues" size={13} /> {warning}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="plan__actions">
        <Button
          variant={isApproved ? 'default' : 'primary'}
          onClick={() => onApprove(plan.id)}
          disabled={isApproved || approving}
        >
          <Icon name={isApproved ? 'activity' : 'remediation'} size={14} />
          {isApproved ? 'Approved' : approving ? 'Approving' : 'Approve fix'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={detailsId}
        >
          {expanded ? 'Hide detail' : 'Review detail'}
        </Button>
        <Link className="button button--ghost" to={`/architecture?focus=${encodeURIComponent(plan.resourceId)}`}>
          <Icon name="architecture" size={14} />
          Show in architecture
        </Link>
      </div>

      {expanded ? (
        <div className="plan__details" id={detailsId}>
          <div className="plan__detail-grid">
            <section>
              <h4 className="plan__label">Expected impact</h4>
              <p className="plan__text">{plan.expectedImpact}</p>
            </section>
            <section>
              <h4 className="plan__label">Rollback</h4>
              <p className="plan__text">{plan.rollbackAction.description}</p>
              <code className="plan__code">
                {plan.rollbackAction.awsOperation} {JSON.stringify(plan.rollbackAction.parameters)}
              </code>
            </section>
          </div>

          <section className="plan__section">
            <h4 className="plan__label">AWS operation this plan would call</h4>
            <code className="plan__code">
              {plan.awsOperation} {JSON.stringify(plan.parameters)}
            </code>
            <p className="plan__note">
              Action type <code>{plan.actionType}</code> comes from the backend allowlist. Nothing outside
              that registry can become an action.
            </p>
          </section>

          <section className="plan__section">
            <h4 className="plan__label">Safety checks</h4>
            <ul className="safety-list">
              {plan.safety.checks.map((check) => (
                <li key={check.id} className="safety-check">
                  <span className={`safety-check__dot safety-check__dot--${check.passed ? 'pass' : 'fail'}`} />
                  <span className="safety-check__label">{check.label}</span>
                  <span className="safety-check__detail">{check.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="plan__section">
            <h4 className="plan__label">Prerequisites</h4>
            <ul className="plan__list">
              {plan.prerequisites.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="plan__section">
            <h4 className="plan__label">Evidence this plan rests on</h4>
            <ul className="plan__list">
              {plan.evidence.map((fact) => (
                <li key={fact.id ?? fact.label}>
                  <strong>{fact.label}:</strong>{' '}
                  {Array.isArray(fact.value) ? `${fact.value.length} sampled entries` : formatValue(fact.value)}
                  {fact.unit ? ` ${fact.unit}` : ''}
                  <span className="plan__source mono"> · {fact.source}</span>
                </li>
              ))}
            </ul>
          </section>

          {plan.audit.bedrockReasoning ? (
            <section className="plan__section">
              <h4 className="plan__label">Bedrock reasoning (advisory)</h4>
              <p className="plan__text">{plan.audit.bedrockReasoning.rootCause}</p>
              <p className="plan__note">{plan.audit.bedrockReasoning.note}</p>
            </section>
          ) : null}

          {plan.approval ? (
            <section className="plan__section">
              <h4 className="plan__label">Approval record</h4>
              <ul className="plan__list">
                <li>Approved {new Date(plan.approval.approvedAt).toLocaleString()} by {plan.approval.approvedBy}</li>
                <li>AWS calls made by this approval: {plan.approval.awsCallsMade}</li>
                <li>Execution performed: {plan.approval.executionPerformed ? 'yes' : 'no'}</li>
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RecommendationOnlyCard({ plan }) {
  const severityTone = SEVERITY_TONE[plan.severity] ?? 'neutral';
  return (
    <article className="plan plan--advisory">
      <header className="plan__header">
        <span className="plan__rail" aria-hidden="true" />
        <div className="plan__identity">
          <div className="plan__badges">
            <Badge tone={severityTone}>{plan.severity}</Badge>
            <Badge tone="outline">Recommendation only</Badge>
            <span className="plan__resource mono">{plan.resourceName}</span>
          </div>
          <h3 className="plan__action">{plan.issue}</h3>
        </div>
      </header>
      <div className="plan__body">
        <p className="plan__rationale">
          {plan.recommendationOnlyReason ?? plan.blockedReason}
        </p>
        {plan.audit?.bedrockReasoning ? (
          <p className="plan__note">
            <strong>Bedrock:</strong> {plan.audit.bedrockReasoning.recommendation}
          </p>
        ) : null}
      </div>
      <div className="plan__actions">
        <Link className="button button--ghost" to={`/architecture?focus=${encodeURIComponent(plan.resourceId)}`}>
          <Icon name="architecture" size={14} />
          Show in architecture
        </Link>
        <Link className="button button--ghost" to="/issues">
          <Icon name="issues" size={14} />
          View detected issue
        </Link>
      </div>
    </article>
  );
}

export { humanizeKey };
export default PlanCard;
