/**
 * A metric's shape at a glance, next to its number. No axes, no labels - the value is
 * stated beside it; this only answers "flat, rising or spiky?".
 */
export function Sparkline({ series, width = 96, height = 24 }) {
  if (!Array.isArray(series) || series.length < 2) return null;

  const values = series.map((point) => point.v ?? 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (series.length - 1);

  const path = values
    .map((value, index) => {
      const x = index * step;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="sparkline" width={width} height={height} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default Sparkline;
