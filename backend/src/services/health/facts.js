/**
 * Observed facts.
 *
 * The application keeps a hard line between what it measured and what it concluded:
 *
 *   fact  - something AWS reported. It carries the API it came from and the window it
 *           covers, and it is true whether or not anyone thinks it is a problem.
 *   issue - an inference a rule drew from one or more facts. It cites them.
 *
 * Keeping these separate means a finding can always be traced back to the numbers that
 * produced it, and a metric that simply does not exist is recorded as unavailable
 * rather than silently becoming a zero.
 */

export function makeFact({
  id,
  kind,
  label,
  value,
  unit = null,
  resourceId = null,
  resourceName = null,
  service = null,
  source,
  window = null,
  series = null,
  available = true,
  note = null,
}) {
  return {
    id,
    kind, // 'metric' | 'log' | 'configuration'
    label,
    value,
    unit,
    resourceId,
    resourceName,
    service,
    source,
    window,
    series,
    available,
    note,
  };
}

/** Sum of a metric series, or null when CloudWatch had nothing to return. */
export function summarise(entry) {
  if (!entry || entry.statusCode === 'InternalError') return { available: false, value: null, points: 0 };
  const values = entry.values ?? [];
  if (values.length === 0) return { available: false, value: null, points: 0 };

  const stat = entry.metric?.stat;
  let value;
  if (stat === 'Sum') value = values.reduce((total, current) => total + current, 0);
  else if (stat === 'Maximum') value = Math.max(...values);
  else value = values.reduce((total, current) => total + current, 0) / values.length;

  return {
    available: true,
    value: Number.parseFloat(value.toFixed(4)),
    points: values.length,
    series: entry.timestamps.map((timestamp, position) => ({ t: timestamp, v: values[position] })),
  };
}

export default { makeFact, summarise };
