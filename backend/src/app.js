import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import config from './config/index.js';
import apiRouter from './routes/index.js';
import { getHealth } from './services/liveness.service.js';
import requestLogger from './middleware/request-logger.js';
import notFound from './middleware/not-found.js';
import errorHandler from './middleware/error-handler.js';

/**
 * Builds the Express app without binding a port, so the same assembly can be
 * started by the server entrypoint or driven directly by a test.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.http.corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);

  // Unversioned alias so uptime checks have a stable path. It answers directly rather
  // than redirecting, and makes no AWS call, so it stays valid even when the account is
  // unreachable.
  app.get('/health', (_req, res) => res.status(200).json(getHealth()));

  app.use('/api/v1', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
