import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

export function TopBar({ title, theme, onToggleTheme, onOpenNav, navOpen }) {
  return (
    <header className="topbar">
      <Button
        variant="ghost"
        iconOnly
        className="topbar__menu"
        onClick={onOpenNav}
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={navOpen}
        aria-controls="sidebar"
      >
        <Icon name={navOpen ? 'close' : 'menu'} size={18} />
      </Button>

      <h2 className="topbar__title">{title}</h2>
      <div className="topbar__spacer" />

      <div className="topbar__actions">
        <Button
          variant="ghost"
          iconOnly
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
        </Button>
      </div>
    </header>
  );
}

export default TopBar;
