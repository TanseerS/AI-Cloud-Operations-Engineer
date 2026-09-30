/**
 * The dot carries the meaning, the label states it in words. Colour alone is never
 * the only signal, which keeps the status readable without colour vision.
 */
export function StatusIndicator({ tone = 'neutral', label, pulse = false }) {
  const toneClass = tone === 'neutral' ? '' : ` status__dot--${tone}`;
  return (
    <span className="status">
      <span className={`status__dot${toneClass}${pulse ? ' status__dot--pulse' : ''}`} />
      {label}
    </span>
  );
}

export default StatusIndicator;
