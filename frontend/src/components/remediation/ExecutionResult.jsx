import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * What actually happened, in the order it happened.
 *
 * Every value here was read back from AWS after the change - none of it is the request
 * echoed back. The verification step is shown as its own stage because an accepted API
 * call is not the same as a resolved problem, and the UI should not let those blur.
 */

function StateValues({ state, fields }) {
  return (
    <dl className="exec-state__values">
      {fields.map((field) => (
        <div key={field} className="exec-state__row">
          <dt className="exec-state__key">{field}</dt>
          <dd className="exec-state__value tabular mono">
            {state?.[field] === null || state?.[field] === undefined ? '—' : String(state[field])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ExecutionResult({ plan }) {
  const { beforeState, afterState, execution, verification, outcome } = plan;
  if (!beforeState && !execution) return null;

  // Only the fields this action could change, so the comparison stays readable.
  const fields = Object.keys(plan.desiredState ?? {});
  const verified = verification?.verified;
  const awsChanged = execution?.awsChangeMade;

  return (
    <div className="execution">
      <div className="execution__flow">
        <section className="exec-state">
          <span className="exec-state__label">Before</span>
          <StateValues state={beforeState} fields={fields} />
          <span className="exec-state__source">{beforeState?.source}</span>
        </section>

        <span className="execution__arrow" aria-hidden="true">
          <Icon name="chevron" size={16} />
        </span>

        <section className="exec-state exec-state--action">
          <span className="exec-state__label">Action</span>
          <p className="exec-state__action mono">{execution?.awsOperation ?? plan.awsOperation}</p>
          <span className="exec-state__source">
            {awsChanged ? 'applied to AWS' : 'no AWS change was needed'}
          </span>
        </section>

        <span className="execution__arrow" aria-hidden="true">
          <Icon name="chevron" size={16} />
        </span>

        <section className="exec-state exec-state--after">
          <span className="exec-state__label">After</span>
          <StateValues state={afterState} fields={fields} />
          <span className="exec-state__source">{afterState?.source}</span>
        </section>

        <span className="execution__arrow" aria-hidden="true">
          <Icon name="chevron" size={16} />
        </span>

        <section className={`exec-state exec-state--${verified ? 'verified' : 'failed'}`}>
          <span className="exec-state__label">Verification</span>
          <p className="exec-state__verdict">
            {verified ? 'Verified' : outcome === 'verification_failed' ? 'Not resolved' : 'Failed'}
          </p>
          <span className="exec-state__source">
            {verification?.verifiedAt ? new Date(verification.verifiedAt).toLocaleTimeString() : ''}
          </span>
        </section>
      </div>

      {verification ? (
        <ul className="execution__evidence">
          {verification.evidence.map((item, index) => (
            <li key={index} className="execution__check">
              <span className={`execution__dot execution__dot--${item.passed ? 'pass' : 'fail'}`} />
              <span className="execution__check-label">{item.check}</span>
              <span className="execution__check-detail">{item.detail}</span>
              <span className="execution__check-source mono">{item.source}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.failure ? (
        <div className="execution__failure">
          <p className="execution__failure-title">
            Failed at the {plan.failure.stage} stage
            <Badge tone={plan.failure.awsChangeAttempted ? 'warning' : 'outline'}>
              {plan.failure.awsChangeAttempted
                ? 'an AWS change was attempted'
                : 'no AWS change was attempted'}
            </Badge>
          </p>
          <p className="execution__failure-message">{plan.failureReason}</p>
          {plan.rollbackAction ? (
            <p className="execution__failure-rollback">
              Rollback available: <code>{plan.rollbackAction.awsOperation}</code>{' '}
              {JSON.stringify(plan.rollbackAction.parameters)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ExecutionResult;
