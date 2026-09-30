import { Handle, Position } from '@xyflow/react';

import Icon from '../ui/Icon.jsx';
import { presentationFor } from '../infrastructure/presentation.js';

/**
 * Path-shaped names (log groups, SSM parameters) carry their meaning in the last
 * segment, so the box shows that and keeps the full value in the tooltip and the panel.
 */
function displayName(name) {
  if (typeof name !== 'string' || !name.includes('/')) return name;
  const segments = name.split('/').filter(Boolean);
  return segments.length > 1 ? `…/${segments[segments.length - 1]}` : name;
}

const STATUS_CLASS = {
  healthy: 'arch-node__dot--success',
  success: 'arch-node__dot--success',
  warning: 'arch-node__dot--warning',
  danger: 'arch-node__dot--danger',
  failing: 'arch-node__dot--danger',
};

/**
 * One box on the diagram. Deliberately quiet: a service icon, the resource name, and a
 * status dot with its label. Colour is carried by the dot alone, so a graph of healthy
 * resources reads as neutral rather than as a wall of green.
 */
const HEALTH_CLASS = { critical: 'danger', high: 'danger', medium: 'warning', low: 'warning', info: 'success' };

export function ResourceNode({ data, selected }) {
  const presentation = presentationFor(data.service);
  // Findings override the discovery status: an Active function with a 100% error rate
  // is not healthy, whatever its Lambda State says.
  const worst = data.health?.worstSeverity;
  const level = worst ? HEALTH_CLASS[worst] : (data.status?.level ?? 'unknown');

  return (
    <div
      className={`arch-node${selected ? ' arch-node--selected' : ''}${
        data.kind === 'group' ? ' arch-node--group' : ''
      }`}
    >
      <Handle type="target" position={data.targetPosition ?? Position.Left} />

      <span className="arch-node__icon">
        <Icon name={presentation.icon} size={15} />
      </span>

      <span className="arch-node__body">
        <span className="arch-node__service">{data.serviceLabel}</span>
        <span className="arch-node__name mono" title={data.name}>
          {displayName(data.name)}
        </span>
      </span>

      <span
        className="arch-node__status"
        title={worst ? `${data.health.issueCount} finding(s), worst: ${worst}` : data.status?.label}
      >
        {data.health?.issueCount ? (
          <span className={`arch-node__issues arch-node__issues--${HEALTH_CLASS[worst]}`}>
            {data.health.issueCount}
          </span>
        ) : null}
        <span className={`arch-node__dot ${STATUS_CLASS[level] ?? ''}`} />
      </span>

      <Handle type="source" position={data.sourcePosition ?? Position.Right} />
    </div>
  );
}

export default ResourceNode;
