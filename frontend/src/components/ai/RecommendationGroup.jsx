import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import EmptyState from '../ui/EmptyState.jsx';

const CONFIDENCE_TONE = { high: 'success', medium: 'warning', low: 'outline' };

export function RecommendationGroup({ title, description, icon, items = [] }) {
  return (
    <Card>
      <CardHeader title={title} description={description} actions={<Badge tone="outline">{items.length}</Badge>} />
      <CardBody flush>
        {items.length === 0 ? (
          <EmptyState icon={icon} title="Nothing proposed here">
            The model did not raise anything in this category from the supplied evidence.
          </EmptyState>
        ) : (
          <ul className="recommendation-list">
            {items.map((item, index) => (
              <li key={index} className="recommendation">
                <div className="recommendation__head">
                  <span className="recommendation__title">{item.title}</span>
                  <span className="recommendation__badges">
                    {item.effort ? <Badge tone="outline">{item.effort} effort</Badge> : null}
                    <Badge tone={CONFIDENCE_TONE[item.confidence] ?? 'outline'}>{item.confidence}</Badge>
                  </span>
                </div>
                <p className="recommendation__rationale">{item.rationale}</p>
                <div className="recommendation__meta">
                  {item.resource ? <span className="mono">{item.resource}</span> : null}
                  {item.estimatedImpact ? <span>{item.estimatedImpact}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default RecommendationGroup;
