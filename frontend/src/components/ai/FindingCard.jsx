import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';
import { SEVERITY_TONE } from '../health/severity.js';

const CONFIDENCE_TONE = { high: 'success', medium: 'warning', low: 'outline' };

/**
 * One AI finding, joined back to the deterministic issue it explains.
 *
 * The chain the user can follow is: architecture node -> detected issue -> the evidence
 * that triggered it -> the model's root cause -> a recommendation. Each link is real:
 * the issue was detected by a rule, and the finding is only shown because its issueId
 * matched that rule's output.
 */
export function FindingCard({ finding, issue }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const severityTone = issue ? SEVERITY_TONE[issue.severity] : 'neutral';

  return (
    <article className={`ai-finding ai-finding--${severityTone}`}>
      <button
        type="button"
        className="ai-finding__summary"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <span className="ai-finding__rail" aria-hidden="true" />
        <span className="ai-finding__head">
          <span className="ai-finding__badges">
            {issue ? <Badge tone={severityTone}>{issue.severity}</Badge> : null}
            <Badge tone={CONFIDENCE_TONE[finding.confidence] ?? 'outline'}>
              {finding.confidence} confidence
            </Badge>
            {issue ? <span className="ai-finding__resource mono">{issue.resource}</span> : null}
          </span>
          <span className="ai-finding__title">{finding.title}</span>
          <span className="ai-finding__cause">{finding.rootCause}</span>
        </span>
        <span className="ai-finding__chevron" data-open={expanded ? 'true' : undefined}>
          <Icon name="chevron" size={14} />
        </span>
      </button>

      {expanded ? (
        <div className="ai-finding__details" id={detailsId}>
          <div className="ai-finding__grid">
            <section>
              <h4 className="ai-finding__label">Impact</h4>
              <p className="ai-finding__text">{finding.impact}</p>
            </section>
            <section>
              <h4 className="ai-finding__label">Recommendation</h4>
              <p className="ai-finding__text">{finding.recommendation}</p>
            </section>
          </div>

          <section className="ai-finding__section">
            <h4 className="ai-finding__label">Evidence the model cited</h4>
            <ul className="ai-evidence">
              {finding.evidence.map((line, index) => (
                <li key={index} className="ai-evidence__line">
                  <code>{line}</code>
                </li>
              ))}
            </ul>
            {issue ? (
              <p className="ai-finding__provenance">
                Measured by the deterministic rule <code>{issue.ruleId}</code>, which detected this
                issue before the model saw it.
              </p>
            ) : null}
          </section>

          {finding.evidenceGaps ? (
            <section className="ai-finding__section">
              <h4 className="ai-finding__label">Evidence still needed</h4>
              <p className="ai-finding__text">{finding.evidenceGaps}</p>
            </section>
          ) : null}

          {issue?.resourceId ? (
            <div className="ai-finding__footer">
              <Link
                className="button button--ghost"
                to={`/architecture?focus=${encodeURIComponent(issue.resourceId)}`}
              >
                <Icon name="architecture" size={14} />
                Show resource in architecture
              </Link>
              <Link className="button button--ghost" to="/issues">
                <Icon name="issues" size={14} />
                View detected issue
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default FindingCard;
