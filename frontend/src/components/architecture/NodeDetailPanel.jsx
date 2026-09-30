import { Link } from 'react-router-dom';

import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import StatusIndicator from '../ui/StatusIndicator.jsx';
import { presentationFor } from '../infrastructure/presentation.js';
import { SEVERITY_TONE } from '../health/severity.js';
import { EMPTY, formatValue, humanizeKey } from '../../lib/format.js';

const STATUS_TONE = { healthy: 'success', warning: 'warning', failing: 'danger', unknown: 'neutral' };

/** Values that only make sense as their own rows (routes, stages, integrations). */
function NestedRows({ items }) {
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

function Row({ label, value }) {
  const isObjectArray =
    Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
  return (
    <div className="detail-row">
      <span className="detail-row__key">{label}</span>
      <span className="detail-row__value">
        {isObjectArray ? <NestedRows items={value} /> : formatValue(value)}
      </span>
    </div>
  );
}

/**
 * The detail panel. Glass over the diagram on desktop, a sheet at the bottom on narrow
 * screens. Everything shown comes from the discovery payload for that node.
 */
export function NodeDetailPanel({ node, connections, issues = [], onClose }) {
  if (!node) return null;

  const presentation = presentationFor(node.service);
  const tags = Object.entries(node.tags ?? {});
  const isGroup = node.kind === 'group';

  return (
    <aside className="detail-panel" aria-label={`Details for ${node.name}`}>
      <header className="detail-panel__header">
        <span className="detail-panel__icon">
          <Icon name={presentation.icon} size={16} />
        </span>
        <span className="detail-panel__identity">
          <span className="detail-panel__service">{node.serviceLabel ?? node.service}</span>
          <span className="detail-panel__name mono">{node.name}</span>
        </span>
        <Button variant="ghost" iconOnly onClick={onClose} aria-label="Close details">
          <Icon name="close" size={16} />
        </Button>
      </header>

      <div className="detail-panel__scroll">
        <div className="detail-panel__status">
          <StatusIndicator
            tone={STATUS_TONE[node.status?.level] ?? 'neutral'}
            label={node.status?.label ?? EMPTY}
          />
          <Badge tone="outline">{node.type}</Badge>
        </div>

        {isGroup ? (
          <section className="detail-panel__section">
            <h4 className="detail-panel__section-title">{node.memberCount} resources</h4>
            <div className="detail-list">
              {node.members.map((member) => (
                <div key={member.id} className="detail-row">
                  <span className="detail-row__key mono">{member.name}</span>
                  <span className="detail-row__value">
                    {formatValue(member.attributes?.parameterType ?? member.status?.label)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="detail-panel__section">
            <h4 className="detail-panel__section-title">Configuration</h4>
            <div className="detail-list">
              <Row label="Region" value={node.region} />
              <Row label="ARN" value={node.arn} />
              {Object.entries(node.attributes ?? {}).map(([key, value]) => (
                <Row key={key} label={humanizeKey(key)} value={value} />
              ))}
            </div>
          </section>
        )}

        {issues.length > 0 ? (
          <section className="detail-panel__section">
            <h4 className="detail-panel__section-title">
              {issues.length} finding{issues.length === 1 ? '' : 's'} on this resource
            </h4>
            <ul className="panel-issues">
              {issues.map((issue) => (
                <li key={issue.id} className="panel-issue">
                  <Badge tone={SEVERITY_TONE[issue.severity] ?? 'neutral'}>{issue.severity}</Badge>
                  <span className="panel-issue__title">{issue.title}</span>
                  {issue.metrics ? (
                    <span className="panel-issue__metrics tabular">
                      {Object.entries(issue.metrics)
                        .slice(0, 2)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(' · ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="panel-issue__actions">
              <Link className="button button--ghost" to="/issues">
                <Icon name="issues" size={13} />
                Evidence
              </Link>
              <Link className="button button--ghost" to="/ai">
                <Icon name="sparkle" size={13} />
                AI analysis
              </Link>
              <Link className="button button--ghost" to="/remediation">
                <Icon name="remediation" size={13} />
                Remediation
              </Link>
            </div>
          </section>
        ) : null}

        {connections.length > 0 ? (
          <section className="detail-panel__section">
            <h4 className="detail-panel__section-title">Relationships</h4>
            <ul className="connection-list">
              {connections.map((connection) => (
                <li key={connection.id} className="connection">
                  <span className="connection__direction">
                    {connection.direction === 'out' ? 'This' : connection.otherName}
                  </span>
                  <span className="connection__label">{connection.label}</span>
                  <span className="connection__target mono">
                    {connection.direction === 'out' ? connection.otherName : 'this'}
                  </span>
                  <span className="connection__evidence">
                    <Badge tone={connection.confidence === 'declared' ? 'outline' : 'warning'}>
                      {connection.confidence}
                    </Badge>
                    <span className="connection__source">{connection.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="detail-panel__section">
          <h4 className="detail-panel__section-title">Tags</h4>
          <div className="detail-panel__tags">
            {tags.length ? (
              tags.map(([key, value]) => (
                <Badge key={key} tone="outline">
                  {key}={value}
                </Badge>
              ))
            ) : (
              <span className="detail-panel__muted">No tags</span>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

export default NodeDetailPanel;
