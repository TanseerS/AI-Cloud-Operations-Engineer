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

/**
 * A trailing window ending today.
 *
 * On the first days of a month the current period can legitimately hold no charges at
 * all, because AWS has not finalised anything yet. The month-to-date figure stays what
 * it is - zero is the honest answer - but a trend with no days in it tells the reader
 * nothing, so this window gives the charts something real to draw while the headline
 * keeps reporting the month.
 */
export function buildTrailingPeriod(days = 30, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = addDays(today, 1); // exclusive
  const start = addDays(end, -days);

  return {
    label: `last ${days} days`,
    start: toIso(start),
    end: toIso(end),
    days,
    partialMonth: false,
  };
}

export default buildPeriods;
