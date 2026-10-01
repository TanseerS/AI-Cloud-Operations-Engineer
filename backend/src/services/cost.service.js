import { describeAwsError } from './aws/clients.js';
import { buildPeriods, buildTrailingPeriod } from './cost/periods.js';
import { billingServiceKey, discoveryServiceFor } from './cost/service-mapping.js';
import {
  BILLING_REGION,
  createRequestCounter,
  getDailyCostByService,
  getRecordTypeTotals,
  getServiceTotals,
} from './cost/cost-explorer.js';

/**
 * Cost analysis.
 *
 * Reports two different numbers on purpose, because in an account with credits they
 * are not the same and conflating them misleads:
 *
 *   usageCost - what the running resources actually cost at list rate
 *   netCost   - what is actually billed after credits, discounts and tax
 *
 * The optimisation question ("is the over-provisioned function expensive?") is about
 * usage. The finance question ("what will I pay?") is about net. Showing only one of
 * them would be wrong in a different way each time.
 *
 * Cost Explorer data is never real-time; nothing here presents it as such.
 */

// Billing data refreshes at most a few times a day, and each request is billed at
// $0.01, so a short cache costs nothing in freshness and bounds the spend.
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache = null;

const round = (value, places = 6) => Number.parseFloat(Number(value).toFixed(places));

function amountOf(metrics, key = 'UnblendedCost') {
  return Number.parseFloat(metrics?.[key]?.Amount ?? '0');
}

function unitOf(metrics, key = 'UnblendedCost') {
  return metrics?.[key]?.Unit ?? null;
}

/** Collapses a DAILY/GroupBy=SERVICE result set into a trend and per-service totals. */
function foldDailyByService(results) {
  const perService = new Map();
  const daily = [];
  let currency = null;
  let estimatedDays = 0;

  for (const day of results) {
    let dayTotal = 0;
    for (const group of day.Groups ?? []) {
      const name = group.Keys?.[0] ?? 'Unknown';
      const amount = amountOf(group.Metrics);
      currency = currency ?? unitOf(group.Metrics);
      perService.set(name, (perService.get(name) ?? 0) + amount);
      dayTotal += amount;
    }
    if (day.Estimated) estimatedDays += 1;
    daily.push({
      date: day.TimePeriod?.Start ?? null,
      cost: round(dayTotal),
      estimated: Boolean(day.Estimated),
    });
  }

  return { perService, daily, currency, estimatedDays };
}

function foldRecordTypes(results) {
  const totals = {};
  let currency = null;
  for (const period of results) {
    for (const group of period.Groups ?? []) {
      const name = group.Keys?.[0] ?? 'Unknown';
      totals[name] = round((totals[name] ?? 0) + amountOf(group.Metrics));
      currency = currency ?? unitOf(group.Metrics);
    }
  }
  return { totals, currency };
}

function foldServiceTotals(results) {
  const totals = new Map();
  for (const period of results) {
    for (const group of period.Groups ?? []) {
      const name = group.Keys?.[0] ?? 'Unknown';
      totals.set(name, (totals.get(name) ?? 0) + amountOf(group.Metrics));
    }
  }
  return totals;
}

/**
 * Turns a daily-by-service result set into the same shape the current period uses, so
 * the frontend can render a trailing window with the components it already has.
 */
function shapeWindow(results, period) {
  const { perService, daily, estimatedDays } = foldDailyByService(results);
  const total = [...perService.values()].reduce((sum, value) => sum + value, 0);

  const services = [...perService.entries()]
    .map(([name, cost]) => ({
      service: name,
      serviceKey: billingServiceKey(name),
      discoveryService: discoveryServiceFor(name),
      cost: round(cost),
      percentage: total > 0 ? round((cost / total) * 100, 2) : 0,
      previousCost: null,
      change: null,
      changePercent: null,
    }))
    .filter((entry) => entry.cost !== 0)
    .sort((a, b) => b.cost - a.cost);

  return {
    available: total > 0,
    period,
    total: round(total),
    estimatedDays,
    daily,
    services,
    topDrivers: services.slice(0, 4),
  };
}

function buildComparison(currentTotal, previousTotal, previousPeriod) {
  if (previousTotal === null || !previousPeriod.comparable) {
    return {
      available: false,
      reason: !previousPeriod.comparable
        ? 'The previous month is shorter than the elapsed days of this one, so the windows are not comparable.'
        : 'Previous-period data could not be retrieved.',
    };
  }

  const absoluteChange = round(currentTotal - previousTotal);
  const percentChange = previousTotal > 0 ? round((absoluteChange / previousTotal) * 100, 2) : null;

  return {
    available: true,
    previousTotal: round(previousTotal),
    absoluteChange,
    percentChange,
    direction: absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat',
    basis: `same ${previousPeriod.days} elapsed days of ${previousPeriod.label}`,
  };
}

export async function getCostAnalysis({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return {
      ...cache.payload,
      meta: { ...cache.payload.meta, cached: true, cacheAgeSeconds: Math.round((Date.now() - cache.at) / 1000) },
    };
  }

  const periods = buildPeriods();
  const counter = createRequestCounter();
  const warnings = [];
  const errors = [];

  // Independent queries: losing the comparison must not lose the current period.
  const [dailyResult, recordResult, previousResult] = await Promise.allSettled([
    getDailyCostByService(counter, periods.current),
    getRecordTypeTotals(counter, periods.current),
    getServiceTotals(counter, periods.previous),
  ]);

  if (dailyResult.status === 'rejected') {
    const error = describeAwsError(dailyResult.reason);
    errors.push({ query: 'current-period-daily', ...error });
    const payload = {
      generatedAt: new Date().toISOString(),
      available: false,
      currency: null,
      periods,
      errors,
      warnings,
      meta: {
        source: 'AWS Cost Explorer',
        metric: 'UnblendedCost',
        billingRegion: BILLING_REGION,
        apiRequests: counter.count,
        cached: false,
        realTime: false,
      },
    };
    return payload;
  }

  const { perService, daily, currency, estimatedDays } = foldDailyByService(dailyResult.value);
  const usageTotal = [...perService.values()].reduce((sum, value) => sum + value, 0);

  let recordTypes = {};
  let netTotal = null;
  if (recordResult.status === 'fulfilled') {
    const folded = foldRecordTypes(recordResult.value);
    recordTypes = folded.totals;
    netTotal = round(Object.values(recordTypes).reduce((sum, value) => sum + value, 0));
  } else {
    const error = describeAwsError(recordResult.reason);
    errors.push({ query: 'current-period-record-types', ...error });
    warnings.push({
      level: 'warning',
      message: 'Credits and tax could not be read, so the net billed figure is unavailable.',
    });
  }

  let previousPerService = new Map();
  let previousTotal = null;
  if (previousResult.status === 'fulfilled') {
    previousPerService = foldServiceTotals(previousResult.value);
    previousTotal = [...previousPerService.values()].reduce((sum, value) => sum + value, 0);
  } else {
    const error = describeAwsError(previousResult.reason);
    errors.push({ query: 'previous-period', ...error });
    warnings.push({
      level: 'warning',
      message: 'Previous-period data could not be retrieved, so no comparison is shown.',
    });
  }

  const services = [...perService.entries()]
    .map(([name, cost]) => {
      const previousCost = previousPerService.has(name) ? round(previousPerService.get(name)) : null;
      const change = previousCost === null ? null : round(cost - previousCost);
      return {
        service: name,
        serviceKey: billingServiceKey(name),
        // The join key for the correlation work that comes later.
        discoveryService: discoveryServiceFor(name),
        cost: round(cost),
        percentage: usageTotal > 0 ? round((cost / usageTotal) * 100, 2) : 0,
        previousCost,
        change,
        changePercent:
          previousCost && previousCost > 0 && change !== null ? round((change / previousCost) * 100, 2) : null,
      };
    })
    .filter((entry) => entry.cost !== 0 || entry.previousCost)
    .sort((a, b) => b.cost - a.cost);

  const lastCompleteDay = [...daily].reverse().find((day) => day.cost > 0)?.date ?? null;

  // Early in a month AWS may not have posted anything yet. The headline stays truthful -
  // month-to-date really is zero - but one extra query gives the trend and the service
  // breakdown real data to show instead of an empty panel. Only runs when it is needed,
  // so it costs nothing on a normal day.
  let trailing = { available: false, reason: 'The current period has charges of its own.' };
  if (usageTotal === 0) {
    const trailingPeriod = buildTrailingPeriod(30);
    try {
      trailing = shapeWindow(await getDailyCostByService(counter, trailingPeriod), trailingPeriod);
      if (!trailing.available) {
        trailing = { available: false, period: trailingPeriod, reason: 'No charges in the last 30 days either.' };
      }
    } catch (error) {
      const described = describeAwsError(error);
      errors.push({ query: 'trailing-window', ...described });
      trailing = { available: false, period: trailingPeriod, reason: described.message };
    }
  }

  // Warnings describe this specific response, not billing in the abstract.
  warnings.push({
    level: 'info',
    message:
      'Cost Explorer data is not real-time. AWS finalises charges over roughly 24 hours, so the most recent day is usually incomplete.',
  });
  if (estimatedDays > 0) {
    warnings.push({
      level: 'info',
      message: `AWS flags ${estimatedDays} of ${daily.length} days in this period as estimated.`,
    });
  }
  const credits = recordTypes.Credit ?? 0;
  if (credits < 0) {
    warnings.push({
      level: 'info',
      message: `Credits offset ${round(Math.abs(credits), 2)} ${currency ?? ''} of usage this period, so the amount actually billed is far below the usage cost.`.trim(),
    });
  }
  warnings.push({
    level: 'info',
    message: `Cost Explorer bills $0.01 per request. This response used ${counter.count} requests and is cached for ${CACHE_TTL_MS / 60000} minutes.`,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    available: true,
    currency: currency ?? 'USD',
    periods,
    dataStatus: {
      realTime: false,
      lastAvailableDate: lastCompleteDay,
      estimatedDays,
      totalDays: daily.length,
      note: 'Figures are the latest available billing data from AWS Cost Explorer, not a live bill.',
    },
    totals: {
      // What the running resources cost at list rate.
      usageCost: round(usageTotal),
      // What is actually billed once credits, discounts and tax are applied.
      netCost: netTotal,
      recordTypes,
    },
    comparison: buildComparison(usageTotal, previousTotal, periods.previous),
    daily,
    services,
    topDrivers: services.filter((entry) => entry.cost > 0).slice(0, 4),
    // Present only when the current period is empty; see above.
    trailing,
    warnings,
    errors,
    partial: errors.length > 0,
    meta: {
      source: 'AWS Cost Explorer',
      metric: 'UnblendedCost',
      billingScope: 'account-wide',
      billingRegion: BILLING_REGION,
      apiRequests: counter.count,
      requestCostUsd: round(counter.count * 0.01, 2),
      cacheTtlMinutes: CACHE_TTL_MS / 60000,
      cached: false,
      realTime: false,
    },
  };

  cache = { at: Date.now(), payload };
  return payload;
}

export default { getCostAnalysis };
