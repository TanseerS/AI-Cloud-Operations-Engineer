/** Errors that carry an HTTP status, so route handlers never build responses by hand. */

export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { status: 404, code: 'not_found' });
    this.name = 'NotFoundError';
  }
}

/**
 * Marks a capability the API is structured for but has not implemented yet.
 * Returning 501 keeps the contract honest: the route exists, the behaviour does not.
 */
export class NotImplementedError extends AppError {
  constructor(capability) {
    super(`${capability} is not implemented yet`, {
      status: 501,
      code: 'not_implemented',
      details: { capability },
    });
    this.name = 'NotImplementedError';
  }
}
