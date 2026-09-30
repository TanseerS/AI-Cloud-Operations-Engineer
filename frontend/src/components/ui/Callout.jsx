import Icon from './Icon.jsx';

const ICONS = { warning: 'issues', danger: 'issues', info: 'activity' };

/** A short, bordered notice. Used for partial failures, never for decoration. */
export function Callout({ tone = 'info', title, children, actions }) {
  return (
    <div className={`callout callout--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="callout__icon">
        <Icon name={ICONS[tone] ?? 'activity'} size={16} />
      </span>
      <div className="callout__body">
        <p className="callout__title">{title}</p>
        {children ? <div className="callout__text">{children}</div> : null}
      </div>
      {actions ? <div className="callout__actions">{actions}</div> : null}
    </div>
  );
}

export default Callout;
