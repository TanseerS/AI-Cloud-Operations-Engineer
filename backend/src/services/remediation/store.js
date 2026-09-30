import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Plan storage.
 *
 * A JSON file on the backend's own disk, not a database and not AWS. Plans are small,
 * few, and only ever read by this process, so a table would be infrastructure without a
 * reason. Writing them to AWS would also mean this planning stage modified the account,
 * which it must not.
 *
 * Writes are serialised through a promise chain and go via a temporary file, so a crash
 * mid-write cannot leave a half-written plan file behind.
 */

/**
 * Where plans live.
 *
 * Locally this is a file beside the code. On Lambda the deployment package is read-only,
 * so REMEDIATION_STORE_DIR points at /tmp - writable, and shared by every invocation on
 * the same container.
 *
 * The trade-off is stated rather than hidden: /tmp does not survive a cold start, so an
 * approval can be lost if a container is recycled between approving and executing. The
 * plan is rebuilt from the current issues in that case, and nothing unsafe happens - the
 * execution path re-validates everything against AWS regardless. Making approvals durable
 * means a real store (DynamoDB, or SSM Advanced tier since the largest plan is ~7 KB),
 * which is a cost this demo does not need to carry.
 */
const DATA_DIR = path.resolve(process.env.REMEDIATION_STORE_DIR || path.join(process.cwd(), '.data'));
const STORE_PATH = path.join(DATA_DIR, 'remediation-plans.json');

let cache = null;
let writeChain = Promise.resolve();

/** Whether a fresh computation would produce a different change from the frozen one. */
function hasDrifted(existing, recomputed) {
  return JSON.stringify(existing.parameters ?? null) !== JSON.stringify(recomputed.parameters ?? null);
}

async function readAll() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed.plans) ? parsed.plans : [];
  } catch (error) {
    // A missing or unreadable store is an empty store, not a failure - the file is
    // created on the first write.
    if (error.code !== 'ENOENT') {
      console.error(JSON.stringify({ level: 'error', message: 'remediation store unreadable', detail: error.message }));
    }
    cache = [];
  }
  return cache;
}

function persist(plans) {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporary = `${STORE_PATH}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ version: 1, plans }, null, 2), 'utf8');
    await fs.rename(temporary, STORE_PATH);
  });
  return writeChain;
}

export async function listPlans() {
  return [...(await readAll())];
}

export async function getPlan(id) {
  return (await readAll()).find((plan) => plan.id === id) ?? null;
}

/** Replaces any existing plan with the same id, so re-planning refreshes rather than duplicates. */
export async function upsertPlans(incoming) {
  const plans = await readAll();
  for (const plan of incoming) {
    const index = plans.findIndex((existing) => existing.id === plan.id);
    if (index === -1) {
      plans.push(plan);
      continue;
    }
    const existing = plans[index];
    if (existing.status !== 'proposed') {
      // Once approved, a plan is frozen. Re-planning must not be able to swap the
      // parameters underneath an approval that was given for different ones - the
      // approval refers to that exact change, not to whatever the rule computes next.
      plans[index] = { ...existing, supersededBy: { recomputedAt: plan.createdAt, differs: hasDrifted(existing, plan) } };
      continue;
    }
    plans[index] = { ...plan, createdAt: existing.createdAt };
  }
  cache = plans;
  await persist(plans);
  return plans;
}

export async function updatePlan(id, mutate) {
  const plans = await readAll();
  const index = plans.findIndex((plan) => plan.id === id);
  if (index === -1) return null;
  plans[index] = mutate({ ...plans[index] });
  cache = plans;
  await persist(plans);
  return plans[index];
}

export async function clearPlans() {
  cache = [];
  await persist([]);
}

export { STORE_PATH };
