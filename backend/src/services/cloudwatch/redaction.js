/**
 * Log redaction.
 *
 * Log lines are the one place in this application where arbitrary application output
 * reaches the browser. Anything that looks like a credential is removed before the
 * sample leaves the backend, and every sample is truncated - a finding needs enough
 * of the line to be recognisable, not the whole payload.
 */

const SECRET_PATTERNS = [
  // AWS access key ids
  [/\b(?:AKIA|ASIA|AIDA|AROA)[0-9A-Z]{12,}\b/g, '[redacted:aws-key-id]'],
  // key=value / "key": "value" for anything that names itself a secret
  [
    /\b(password|passwd|pwd|secret|token|api[-_]?key|apikey|credential|authorization|auth|private[-_]?key|session[-_]?token)\b(\s*[:=]\s*)("?)[^\s",}]{4,}\3/gi,
    (_match, key, sep) => `${key}${sep}[redacted]`,
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{10,}=*/g, 'Bearer [redacted]'],
  // Long opaque blobs - the shape of a key or a signed token
  [/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, '[redacted:opaque]'],
];

const MAX_LENGTH = 400;

export function redact(message) {
  if (typeof message !== 'string') return '';
  let safe = message;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    safe = safe.replace(pattern, replacement);
  }
  safe = safe.replace(/\s+/g, ' ').trim();
  return safe.length > MAX_LENGTH ? `${safe.slice(0, MAX_LENGTH)}…` : safe;
}

export default redact;
