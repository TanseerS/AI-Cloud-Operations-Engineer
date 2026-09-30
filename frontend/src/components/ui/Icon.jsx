/**
 * A small hand-rolled icon set. Stroke-based, 1.5px, aligned to a 24px grid so
 * icons sit optically level with 14px text. No icon library dependency.
 */

const PATHS = {
  overview: 'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
  architecture: 'M12 3v4M5 21v-4M19 21v-4M12 7h0M5 17H3v4h4v-4zM21 17h-2v4h4v-4zM12 7a5 5 0 0 0-5 5v5M12 7a5 5 0 0 1 5 5v5',
  cost: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 3 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3',
  issues: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h0',
  remediation: 'M14.7 6.3a4 4 0 0 1 5.3 5.3l-9.4 9.4a2 2 0 0 1-2.8 0l-2.8-2.8a2 2 0 0 1 0-2.8z M13 7l4 4',
  reset: 'M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6 6 18M6 6l12 12',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
  cloud: 'M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 7 19z',
  logs: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5',
};

export function Icon({ name, size = 16, className, ...rest }) {
  const d = PATHS[name];
  if (!d) return null;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

export default Icon;
