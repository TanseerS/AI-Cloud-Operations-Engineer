export function PageHeader({ title, subtitle, aside }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {aside ? <div className="page-header__aside">{aside}</div> : null}
    </div>
  );
}

export default PageHeader;
