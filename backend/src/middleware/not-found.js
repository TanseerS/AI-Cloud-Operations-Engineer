import { NotFoundError } from '../lib/errors.js';

export function notFound(req, _res, next) {
  next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
}

export default notFound;
