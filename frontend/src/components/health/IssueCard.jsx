import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';
import Sparkline from './Sparkline.jsx';
import { SEVERITY_TONE, CATEGORY_LABEL } from './severity.js';
import { EMPTY, formatValue, humanizeKey } from '../../lib/format.js';

/** Log samples render as lines; everything else is a labelled value. */
function EvidenceValue({ fact }) {
  if (!fact.available) {
    return <span className="evidence__unavailable">Not available — {fact.note ?? 'no data returned'}</span>;
  }

  if (Array.isArray(fact.value)) {
    return (
      <ul className="evidence__lines">
        {fact.value.map((entry, index) => (
          <li key={index}>
            <span className="evidence__line-time">{entry.timestamp?.slice(11, 19)}</span>
            <code className="evidence__line-text">{entry.message}</code>
          </li>
        ))}
      </ul>
    );
  }

  if (fact.value !== null && typeof fact.value === 'object') {
    return (
      <span className="evidence__object">
        {Object.entries(fact.value).map(([key, value]) => (
          <span key={key} className="evidence__pair">
            <span className="evidence__pair-key">{humanizeKey(key)}</span>
            <span className="evidence__pair-value tabular">{formatValue(value)}</span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="evidence__value tabular">
      {fact.value === null ? EMPTY : formatValue(fact.value)}
      {fact.unit && fact.value !== null ? <span className="evidence__unit"> {fact.unit}</span> : null}
    </span>
  );
}

export function IssueCard({ issue, resourceHealth }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const tone = SEVERITY_TONE[issue.severity] ?? 'neutral';

  // The two or three numbers that made the rule fire, shown before anything is expanded.
  const headlineMetrics = Object.entries(issue.metrics ?? {}).slice(0, 3);

  return (
    <article className={`issue issue--${tone}`}>
      <button
        type="button"
        className="issue__summary"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <span className="issue__severity-rail" aria-hidden="true" />

        <span className="issue__head">
          <span className="issue__badges">
            <Badge tone={tone}>{issue.severity}</Badge>
            <Badge tone="outline">{CATEGORY_LABEL[issue.category] ?? issue.category}</Badge>
            <span className="issue__resource mono">{issue.resource}</span>
          </span>
          <span className="issue__title">{issue.title}</span>
          <span className="issue__metrics">
            {headlineMetrics.map(([key, value]) => (
              <span key={key} className="issue__metric">
                <span className="issue__metric-key">{humanizeKey(key)}</span>
                <span className="issue__metric-value tabular">{formatValue(value)}</span>
              </span>
            ))}
          </span>
        </span>

        <span className="issue__chevron" data-open={expanded ? 'true' : undefined}>
          <Icon name="chevron" size={14} />
        </span>
      </button>

      {expanded ? (
        <div className="issue__details" id={detailsId}>
          <p className="issue__description">{issue.description}</p>

          <div className="issue__section">
            <h4 className="issue__section-title">Evidence</h4>
            <ul className="evidence">
              {issue.evidence.map((fact) => (
                <li key={fact.id} className="evidence__item">
                  <div className="evidence__head">
                    <span className="evidence__label">{fact.label}</span>
                    <Badge tone="outline">{fact.kind}</Badge>
                    {fact.series?.length > 1 ? <Sparkline series={fact.series} /> : null}
                  </div>
                  <EvidenceValue fact={fact} />
                  <p className="evidence__source mono">{fact.source}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="issue__footer">
            <span className="issue__footer-meta">
              Detected {new Date(issue.detectedAt).toLocaleString()} · rule <code>{issue.ruleId}</code> ·{' '}
              status {issue.status}
            </span>
            {issue.resourceId ? (
              <Link
                className="button button--ghost issue__link"
                to={`/architecture?focus=${encodeURIComponent(issue.resourceId)}`}
              >
                <Icon name="architecture" size={14} />
                Show in architecture
              </Link>
            ) : null}
          </div>

          {resourceHealth && resourceHealth.issueCount > 1 ? (
            <p className="issue__sibling">
              This resource has {resourceHealth.issueCount} findings in total.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default IssueCard;
