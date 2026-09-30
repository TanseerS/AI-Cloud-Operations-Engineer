/**
 * Currency formatting for figures that span four orders of magnitude - a $1.44 total
 * next to a $0.0002 service. A fixed 2dp would render most of this account's services
 * as "$0.00", which reads as "free" rather than "small".
 */

export function formatCurrency(value, currency = 'USD', { precise = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';

  const magnitude = Math.abs(value);
  let fractionDigits = 2;
  if (precise && magnitude > 0 && magnitude < 0.01) fractionDigits = magnitude < 0.0001 ? 6 : 4;

  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);

  const twoDp = (input) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(input);

  if (!precise && magnitude > 0 && magnitude < 0.005) {
    // A charge too small to show is not the same as no charge, and a net figure that
    // rounds to zero is not the same as a charge below a cent.
    return magnitude < 0.0005 ? `≈${twoDp(0)}` : `<${twoDp(0.01)}`;
  }

  return formatted;
}

export function formatPercent(value, { signed = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = signed && value > 0 ? '+' : '';
  const digits = Math.abs(value) >= 10 ? 0 : 1;
  return `${sign}${value.toFixed(digits)}%`;
}

export default { formatCurrency, formatPercent };
