import { useId, useState } from 'react';

import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';
import StatusIndicator from '../ui/StatusIndicator.jsx';
import { EMPTY, formatValue, humanizeKey } from '../../lib/format.js';

const STATUS_TONE = { healthy: 'success', warning: 'warning', failing: 'danger', unknown: 'neutral' };

/** Arrays of objects (routes, stages, integrations) read better as their own rows. */
function NestedList({ items }) {
  return (
    <ul className="nested-list">
      {items.map((item, index) => (
        <li key={index} className="nested-list__item">
          {Object.entries(item)
            .filter(([, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => (
              <span key={key} className="nested-list__pair">
                <span className="nested-list__key">{humanizeKey(key)}</span>
                <span className="nested-list__value mono">{formatValue(value)}</span>
              </span>
            ))}
        </li>
      ))}
    </ul>
  );
}

function AttributeRow({ label, value }) {
  const isObjectArray =
    Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null;

  return (
    <div className="detail-row">
      <span className="detail-row__key">{label}</span>
      <span className="detail-row__value">
        {isObjectArray ? <NestedList items={value} /> : formatValue(value)}
      </span>
    </div>
  );
}

export function ResourceCard({ resource, highlights = [] }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  const tone = STATUS_TONE[resource.status?.level] ?? 'neutral';
  const tagEntries = Object.entries(resource.tags ?? {});

  return (
    <article className="resource">
      <button
        type="button"
        className="resource__summary"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <span className="resource__chevron" data-open={expanded ? 'true' : undefined}>
          <Icon name="chevron" size={14} />
        </span>

        <span className="resource__identity">
          <span className="resource__name mono">{resource.name}</span>
          <span className="resource__meta">
            {highlights.map((item) => (
              <span key={item.label} className="resource__fact">
                <span className="resource__fact-key">{item.label}</span>
                <span className="resource__fact-value tabular">{item.value}</span>
              </span>
            ))}
          </span>
        </span>

        <span className="resource__status">
          <StatusIndicator tone={tone} label={resource.status?.label ?? EMPTY} />
        </span>
      </button>

      {expanded ? (
        <div className="resource__details" id={detailsId}>
          <div className="detail-list">
            <AttributeRow label="ARN" value={resource.arn} />
            <AttributeRow label="Region" value={resource.region} />
            {Object.entries(resource.attributes ?? {}).map(([key, value]) => (
              <AttributeRow key={key} label={humanizeKey(key)} value={value} />
            ))}
          </div>

          <div className="resource__tags">
            <span className="resource__tags-label">Tags</span>
            <span className="resource__tag-list">
              {tagEntries.length ? (
                tagEntries.map(([key, value]) => (
                  <Badge key={key} tone="outline">
                    {key}={value}
                  </Badge>
                ))
              ) : (
                <span className="resource__fact-key">No tags</span>
              )}
            </span>
          </div>

          <p className="resource__matched">
            Matched as a lab resource by: {(resource.matchedBy ?? []).join(', ') || 'unknown'}
          </p>
        </div>
      ) : null}
    </article>
  );
}

export default ResourceCard;
