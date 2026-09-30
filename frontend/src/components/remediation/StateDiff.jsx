import Icon from '../ui/Icon.jsx';

/**
 * The change itself: what the resource is now, and what the plan would make it.
 *
 * Shown as two labelled states rather than a sentence, because "3008 MB becomes 128 MB"
 * is the part an approver actually needs to check.
 */
function StatePanel({ label, values, tone }) {
  return (
    <div className={`state-panel state-panel--${tone}`}>
      <span className="state-panel__label">{label}</span>
      <dl className="state-panel__values">
        {Object.entries(values ?? {}).map(([key, value]) => (
          <div key={key} className="state-panel__row">
            <dt className="state-panel__key">{key}</dt>
            <dd className="state-panel__value tabular mono">
              {value === null ? 'none' : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StateDiff({ currentState, desiredState }) {
  return (
    <div className="state-diff">
      <StatePanel label="Current" values={currentState} tone="current" />
      <span className="state-diff__arrow" aria-hidden="true">
        <Icon name="chevron" size={16} />
      </span>
      <StatePanel label="Proposed" values={desiredState} tone="proposed" />
    </div>
  );
}

export default StateDiff;
