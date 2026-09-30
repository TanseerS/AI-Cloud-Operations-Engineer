import Card from './Card.jsx';
import Icon from './Icon.jsx';

export function StatTile({ label, value, hint, icon, mono = false }) {
  return (
    <Card className="stat">
      <div className="stat__label">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </div>
      <div className={`stat__value tabular${mono ? ' stat__value--mono' : ''}`}>{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </Card>
  );
}

export default StatTile;
