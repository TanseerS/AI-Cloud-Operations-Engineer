/**
 * Central configuration.
 *
 * Every tunable value enters the process here and nowhere else, so a reader can
 * see the full surface of what the environment controls in one file.
 *
 * Credentials are intentionally not part of this object. The AWS SDK resolves
 * them at call time from the standard provider chain, which keeps secrets out of
 * the repository, the process arguments and the logs.
 */
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config();

const ENVIRONMENTS = ['development', 'test', 'production'];

function readString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function readPort(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535, received "${raw}"`);
  }
  return port;
}

function readList(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const environment = readString('NODE_ENV', 'development');
if (!ENVIRONMENTS.includes(environment)) {
  throw new Error(`NODE_ENV must be one of ${ENVIRONMENTS.join(', ')}, received "${environment}"`);
}

export const config = Object.freeze({
  service: {
    name: 'aicoe-api',
    version: '0.1.0',
    environment,
  },
  server: {
    host: readString('HOST', '127.0.0.1'),
    port: readPort('PORT', 4000),
  },
  aws: {
    // Region only. Credentials come from the SDK provider chain at runtime.
    region: readString('AWS_REGION', 'us-east-1'),
    labPrefix: 'aicoe-lab',
    baselineParameterPath: '/aicoe-lab/baseline',
  },
  http: {
    corsOrigins: readList('CORS_ORIGINS', ['http://localhost:5180', 'http://localhost:4180']),
  },
  logging: {
    level: readString('LOG_LEVEL', 'info'),
  },
});

export default config;
