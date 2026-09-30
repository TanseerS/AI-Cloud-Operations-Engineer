const TONES = ['neutral', 'success', 'warning', 'danger', 'info', 'outline'];

export function Badge({ tone = 'neutral', children }) {
  const variant = TONES.includes(tone) && tone !== 'neutral' ? ` badge--${tone}` : '';
  return <span className={`badge${variant}`}>{children}</span>;
}

export default Badge;
