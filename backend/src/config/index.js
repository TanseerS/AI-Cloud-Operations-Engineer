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
  bedrock: {
    // Chosen by measurement, not preference. On 2026-09-30 every Anthropic model in
    // this account failed 3/3 with INVALID_PAYMENT_INSTRUMENT (an AWS Marketplace
    // subscription the account cannot complete), while Nova Pro and Nova Lite
    // succeeded 3/3. Nova Pro is the most capable model this account can reliably
    // invoke and it honours forced tool use, which is what the structured output
    // depends on. Never hardcoded elsewhere: every caller reads it from here.
    modelId: readString('BEDROCK_MODEL_ID', 'us.amazon.nova-pro-v1:0'),
    // Tried in order when the primary is unavailable. Access is per-model in Bedrock
    // and can fail for reasons unrelated to the request (marketplace subscription,
    // regional access), so a verified fallback keeps the feature usable.
    fallbackModelIds: readList('BEDROCK_FALLBACK_MODEL_IDS', [
      'us.amazon.nova-lite-v1:0',
      // Kept last so the feature picks it up automatically if the account's
      // Anthropic subscription starts working again.
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    ]),
    // Bedrock runtime region. Separate from the workload region because model
    // availability differs by region.
    region: readString('BEDROCK_REGION', readString('AWS_REGION', 'us-east-1')),
    // Always set explicitly: an unset value reserves the model's maximum against the
    // account's throughput quota and is a common cause of spurious throttling.
    maxTokens: readPort('BEDROCK_MAX_TOKENS', 4096),
    temperature: 0,
    // Analysis is expensive enough to be deliberate: it runs on an explicit request,
    // never on a page render, and a result is reused for this long.
    cacheTtlSeconds: readPort('BEDROCK_CACHE_TTL_SECONDS', 600),
    minIntervalSeconds: readPort('BEDROCK_MIN_INTERVAL_SECONDS', 20),
  },
  remediation: {
    // Where approved plans live.
    //
    // A DynamoDB table when one is named, which is what deployment does: a plan carries
    // the approval record and the verification result, and on Lambda those cannot live on
    // a container's own disk without being lost when the container is recycled.
    //
    // With no table named - local development - plans fall back to a JSON file, so the
    // app runs with no AWS dependency for storage.
    tableName: readString('REMEDIATION_TABLE_NAME', ''),
    storeDir: readString('REMEDIATION_STORE_DIR', ''),
  },
  automation: {
    // The scheduled lab check. Interval lives here rather than in the deploy script, so
    // the schedule and anything that reports on it read the same number.
    intervalHours: readPort('LAB_AUTOMATION_INTERVAL_HOURS', 6),
    scheduleName: readString('LAB_AUTOMATION_SCHEDULE_NAME', 'aicoe-lab-autonomous-check'),
    functionName: readString('LAB_AUTOMATION_FUNCTION_NAME', 'aicoe-lab-autonomous-manager'),
    // Shared audit record. The scheduled Lambda writes it; the API reads it, so the
    // dashboard can report autonomous runs it never saw.
    statePath: readString('LAB_AUTOMATION_STATE_PATH', '/aicoe-lab/automation/state'),
  },
  http: {
    corsOrigins: readList('CORS_ORIGINS', ['http://localhost:5180', 'http://localhost:4180']),
  },
  logging: {
    level: readString('LOG_LEVEL', 'info'),
  },
});

export default config;
