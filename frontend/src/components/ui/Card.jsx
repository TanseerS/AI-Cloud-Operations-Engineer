export function Card({ as: Tag = 'section', interactive = false, className = '', children, ...rest }) {
  return (
    <Tag className={`card${interactive ? ' card--interactive' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions }) {
  return (
    <header className="card__header">
      <div>
        <h3 className="card__title">{title}</h3>
        {description ? <p className="card__description">{description}</p> : null}
      </div>
      {actions ? <div className="topbar__actions">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ flush = false, children }) {
  return <div className={`card__body${flush ? ' card__body--flush' : ''}`}>{children}</div>;
}

export default Card;
