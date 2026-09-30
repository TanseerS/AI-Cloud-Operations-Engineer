import config from './config.js';

/** An API failure that still carries the status, so the UI can say what went wrong. */
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The single place the frontend talks to the backend. Every call is timed, because
 * latency is the first thing an operations dashboard should be honest about.
 */
export async function request(path, { method = 'GET', signal, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const startedAt = performance.now();
  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(body?.error?.message || `Request failed with ${response.status}`, {
        status: response.status,
        code: body?.error?.code,
      });
    }

    return { data: body, latencyMs };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, { code: 'timeout' });
    }
    throw new ApiError('Could not reach the API', { code: 'network_error' });
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request('/health'),
  index: () => request('/'),
  // Discovery fans out across several AWS services, so it needs more headroom than a
  // health check.
  infrastructure: () => request('/infrastructure/resources', { timeoutMs: 30000 }),
  architecture: () => request('/architecture/graph', { timeoutMs: 30000 }),
  costs: () => request('/costs', { timeoutMs: 30000 }),
  // Health analysis fans out across discovery, CloudWatch metrics and logs. Distinct
  // from `health` above, which is the cheap liveness probe the app shell polls - they
  // were briefly the same key, and the analysis silently shadowed the probe.
  healthAnalysis: () => request('/health/analysis', { timeoutMs: 45000 }),
  // Free: configuration and last-known state, no Bedrock call.
  aiStatus: () => request('/ai/status'),
  // POST on purpose. Analysis costs money, so it can never be triggered by a render,
  // a prefetch or a crawler - only by someone deciding to run it.
  aiAnalyze: ({ force = false } = {}) =>
    request(`/ai/analyze${force ? '?force=true' : ''}`, { method: 'POST', timeoutMs: 120000 }),
  remediationPlans: () => request('/remediation/plans'),
  // Planning re-derives every target from AWS, so it takes as long as a discovery pass.
  // The body carries no target: the backend rejects any attempt to supply one.
  planRemediation: () => request('/remediation/plan', { method: 'POST', timeoutMs: 120000 }),
  approvePlan: (id) =>
    request(`/remediation/plans/${encodeURIComponent(id)}/approve`, { method: 'POST', timeoutMs: 20000 }),
};

export default api;
