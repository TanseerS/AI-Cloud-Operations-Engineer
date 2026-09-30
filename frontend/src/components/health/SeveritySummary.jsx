import Card from '../ui/Card.jsx';
import { SEVERITY_ORDER, SEVERITY_TONE } from './severity.js';

/**
 * Counts per severity. Every tile is present even at zero, so the shape of the row
 * stays stable between refreshes and a zero is visibly a zero rather than a gap.
 */
export function SeveritySummary({ counts, activeSeverity, onSelect }) {
  return (
    <div className="severity-grid">
      {SEVERITY_ORDER.filter((severity) => severity !== 'info' || counts.info > 0).map((severity) => {
        const tone = SEVERITY_TONE[severity];
        const count = counts[severity] ?? 0;
        const active = activeSeverity === severity;

        return (
          <Card
            key={severity}
            as="button"
            interactive
            className={`severity severity--${tone}${active ? ' severity--active' : ''}${
              count === 0 ? ' severity--empty' : ''
            }`}
            onClick={() => onSelect(active ? null : severity)}
            aria-pressed={active}
          >
            <span className="severity__top">
              <span className={`severity__dot severity__dot--${tone}`} />
              <span className="severity__label">{severity}</span>
            </span>
            <span className="severity__count tabular">{count}</span>
          </Card>
        );
      })}
    </div>
  );
}

export default SeveritySummary;
