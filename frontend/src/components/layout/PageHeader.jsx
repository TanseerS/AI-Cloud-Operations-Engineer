/**
 * The page header.
 *
 * Follows the reference design's masthead: a small italic-serif category sitting on a
 * hairline rule, then a heavy display headline. The eyebrow is what makes a dense
 * working page still read as part of the same publication as the overview.
 */
export function PageHeader({ eyebrow, title, subtitle, aside }) {
  return (
    <div className="page-header">
      <div className="page-header__lead">
        {eyebrow ? <p className="eyebrow eyebrow--measured">{eyebrow}</p> : null}
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {aside ? <div className="page-header__aside">{aside}</div> : null}
    </div>
  );
}

export default PageHeader;
