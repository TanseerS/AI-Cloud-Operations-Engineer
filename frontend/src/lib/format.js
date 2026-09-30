/** Display helpers. Nothing here invents a value - a missing value renders as an em dash. */

export const EMPTY = '—';

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return EMPTY;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatRetention(days) {
  if (days === null || days === undefined) return 'Never expires';
  if (days < 365) return `${days} days`;
  const years = days / 365.25;
  return `${days} days (~${years.toFixed(years < 10 ? 1 : 0)} years)`;
}

export function formatDateTime(value) {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(value) {
  if (!value) return EMPTY;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return EMPTY;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return EMPTY;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** camelCase attribute keys become readable labels without a hand-written dictionary. */
export function humanizeKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase())
    .replace(/\bMb\b/, 'MB')
    .replace(/\bMs\b/, 'ms')
    .replace(/\bArn\b/, 'ARN')
    .replace(/\bId\b/, 'ID')
    .replace(/\bApi\b/, 'API');
}

export function formatValue(value) {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  return String(value);
}
