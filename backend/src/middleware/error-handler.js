import config from '../config/index.js';
import { AppError } from '../lib/errors.js';

/** A deliberate 501 is an expected answer, not a fault, so it never logs a stack. */
function isExpected(err, status) {
  return err instanceof AppError && (status < 500 || err.code === 'not_implemented');
}

/** Single place where an error becomes a response body. */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
export function errorHandler(err, _req, res, _next) {
  const isKnown = err instanceof AppError;
  const status = isKnown ? err.status : 500;

  if (!isExpected(err, status)) {
    console.error(
      JSON.stringify({ level: 'error', message: err.message, stack: err.stack }),
    );
  }

  res.status(status).json({
    error: {
      code: isKnown ? err.code : 'internal_error',
      message: isKnown ? err.message : 'An unexpected error occurred',
      ...(isKnown && err.details ? { details: err.details } : {}),
      ...(config.service.environment === 'development' && !isKnown ? { stack: err.stack } : {}),
    },
  });
}

export default errorHandler;
