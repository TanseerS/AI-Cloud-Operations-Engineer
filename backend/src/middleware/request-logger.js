import config from '../config/index.js';

const SILENT = config.logging.level === 'silent' || config.service.environment === 'test';

/** One structured line per request. Enough to debug locally, cheap enough to leave on. */
export function requestLogger(req, res, next) {
  if (SILENT) return next();

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      JSON.stringify({
        // 501 means "planned, not built" - an expected answer, not a fault.
        level: res.statusCode >= 500 && res.statusCode !== 501 ? 'error' : 'info',
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Number(durationMs.toFixed(1)),
      }),
    );
  });

  next();
}

export default requestLogger;
