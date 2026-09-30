import { NavLink } from 'react-router-dom';

import Icon from '../ui/Icon.jsx';
import config from '../../lib/config.js';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: 'overview', end: true },
  { to: '/infrastructure', label: 'Infrastructure', icon: 'server' },
  { to: '/architecture', label: 'Architecture', icon: 'architecture' },
  { to: '/cost', label: 'Cost', icon: 'cost' },
  { to: '/issues', label: 'Issues', icon: 'issues' },
  { to: '/ai', label: 'AI analysis', icon: 'sparkle' },
  { to: '/remediation', label: 'Remediation', icon: 'remediation' },
];

export function Sidebar({ open, onNavigate, region }) {
  return (
    <aside id="sidebar" className={`sidebar${open ? ' sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden="true">
          <Icon name="activity" size={16} />
        </span>
        <span className="sidebar__brand-text">
          <span className="sidebar__name">AI Cloud Ops</span>
          <span className="sidebar__tagline">Engineer</span>
        </span>
      </div>

      <nav aria-label="Primary">
        <p className="sidebar__section-label" id="nav-label">
          Workspace
        </p>
        <ul className="sidebar__nav" aria-labelledby="nav-label">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
              >
                <Icon name={item.icon} size={16} className="nav-item__icon" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__footer-row">
          <span className="sidebar__footer-key">Environment</span>
          <span className="sidebar__footer-value">{config.appEnv}</span>
        </div>
        <div className="sidebar__footer-row">
          <span className="sidebar__footer-key">Region</span>
          <span className="sidebar__footer-value mono">{region ?? '—'}</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
