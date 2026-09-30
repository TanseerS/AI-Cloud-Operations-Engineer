/**
 * Billing period arithmetic.
 *
 * Cost Explorer treats the End of a TimePeriod as exclusive, and a like-for-like
 * comparison needs the same number of elapsed days on both sides - comparing a
 * 30-day month against a partial one is the easiest way to report a fake saving.
 */

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function buildPeriods(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentStart = startOfMonth(today);
  const currentEnd = addDays(today, 1); // exclusive
  const elapsedDays = Math.round((currentEnd - currentStart) / 86400000);

  const previousStart = startOfMonth(addDays(currentStart, -1));
  // Same elapsed-day count, clamped so it can never spill into the current month.
  const previousEndCandidate = addDays(previousStart, elapsedDays);
  const previousEnd = previousEndCandidate > currentStart ? currentStart : previousEndCandidate;
  const previousDays = Math.round((previousEnd - previousStart) / 86400000);

  return {
    current: {
      label: currentStart.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      start: toIso(currentStart),
      end: toIso(currentEnd),
      days: elapsedDays,
      partialMonth: true,
    },
    previous: {
      label: previousStart.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      start: toIso(previousStart),
      end: toIso(previousEnd),
      days: previousDays,
      // Only a fair comparison when both windows cover the same number of days.
      comparable: previousDays === elapsedDays,
    },
  };
}

export default buildPeriods;
