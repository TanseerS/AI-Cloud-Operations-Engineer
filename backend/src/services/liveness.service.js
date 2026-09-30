import process from 'node:process';
import config from '../config/index.js';

/**
 * Process liveness. Makes no AWS calls, so it stays a safe probe that answers even when
 * the account is unreachable - which is exactly when you need it to answer.
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
