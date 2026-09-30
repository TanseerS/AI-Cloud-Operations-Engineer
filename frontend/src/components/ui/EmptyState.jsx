import Icon from './Icon.jsx';

export function EmptyState({ icon = 'cloud', title, children }) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={20} />
      </div>
      <h3 className="empty__title">{title}</h3>
      {children ? <p className="empty__body">{children}</p> : null}
    </div>
  );
}

export default EmptyState;
