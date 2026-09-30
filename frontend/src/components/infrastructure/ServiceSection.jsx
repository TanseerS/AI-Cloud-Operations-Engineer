import Card from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';
import ResourceCard from './ResourceCard.jsx';
import { presentationFor } from './presentation.js';
import { formatDuration } from '../../lib/format.js';

const STATUS_BADGE = {
  ok: { tone: 'success', text: 'Discovered' },
  partial: { tone: 'warning', text: 'Partial' },
  failed: { tone: 'danger', text: 'Failed' },
};

/** One AWS service: its header, and the resources found beneath it. */
export function ServiceSection({ service }) {
  const presentation = presentationFor(service.service);
  const badge = STATUS_BADGE[service.status] ?? STATUS_BADGE.ok;

  return (
    <Card className="service">
      <header className="service__header">
        <span className="service__icon">
          <Icon name={presentation.icon} size={16} />
        </span>
        <span className="service__identity">
          <span className="service__name">{service.label}</span>
          <span className="service__type mono">{service.resourceType}</span>
        </span>
        <span className="service__meta">
          {service.durationMs !== null && service.durationMs !== undefined ? (
            <span className="service__duration tabular">{formatDuration(service.durationMs)}</span>
          ) : null}
          <span className="service__count tabular">{service.resourceCount}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </span>
      </header>

      {service.status === 'failed' ? (
        <div className="service__error">
          <p className="service__error-title">{service.error?.name ?? 'Discovery failed'}</p>
          <p className="service__error-message">{service.error?.message}</p>
        </div>
      ) : service.resources.length === 0 ? (
        <p className="service__empty">No resources found for this service.</p>
      ) : (
        <div className="service__resources">
          {service.resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              highlights={presentation.highlights(resource.attributes ?? {})}
            />
          ))}
        </div>
      )}

      {service.warnings?.length ? (
        <ul className="service__warnings">
          {service.warnings.map((warning, index) => (
            <li key={index}>
              <strong>{warning.resource}</strong>: {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export default ServiceSection;
