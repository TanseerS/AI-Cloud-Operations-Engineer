import process from 'node:process';
import config from '../config/index.js';

/**
 * The only service with real behaviour so far. It reports on the process itself
 * and makes no AWS calls, so it stays a safe liveness probe.
 */
export function getHealth() {
  return {
    status: 'ok',
    service: config.service.name,
    version: config.service.version,
    environment: config.service.environment,
    region: config.aws.region,
    uptimeSeconds: Number(process.uptime().toFixed(1)),
    timestamp: new Date().toISOString(),
  };
}

export default { getHealth };
