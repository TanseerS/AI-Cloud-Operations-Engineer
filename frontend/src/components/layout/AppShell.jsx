import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import Sidebar, { NAV_ITEMS } from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import useTheme from '../../hooks/useTheme.js';

function titleForPath(pathname) {
  const match = NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  );
  return match ? match.label : 'Not found';
}

export function AppShell({ region, children }) {
  const { theme, toggle } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Escape closes the mobile drawer - a drawer with no keyboard exit is a trap.
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} region={region} />

      {navOpen ? (
        <div
          className="scrim scrim--visible"
          role="presentation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="shell__main">
        <TopBar
          title={titleForPath(pathname)}
          theme={theme}
          onToggleTheme={toggle}
          onOpenNav={() => setNavOpen((open) => !open)}
          navOpen={navOpen}
        />
        <main id="main" className="shell__content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
