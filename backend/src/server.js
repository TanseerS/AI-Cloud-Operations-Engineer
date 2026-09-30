import process from 'node:process';

import config from './config/index.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'server started',
      service: config.service.name,
      version: config.service.version,
      environment: config.service.environment,
      region: config.aws.region,
      url: `http://${config.server.host}:${config.server.port}`,
    }),
  );
});

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', message: 'shutting down', signal }));
  server.close(() => process.exit(0));
  // Do not let a hung connection hold the process open forever.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
