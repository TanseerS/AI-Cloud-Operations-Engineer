import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import config from '../../config/index.js';
import * as dynamo from './store-dynamodb.js';

/**
 * Plan storage.
 *
 * A plan is the audit record: what was proposed, who approved it, what AWS reported
 * before and after, and whether verification passed. It has to outlive the process that
 * made it, which is why the backing store is chosen by environment rather than fixed:
 *
 *   deployed - DynamoDB. Lambda containers are recycled, and a plan held on a container's
 *              own disk disappears with it. A fix could then be applied and verified and
 *              still show as awaiting approval on the next request, which is worse than
 *              useless in an audit trail.
 *   local    - a JSON file beside the code, so development needs no AWS resource at all.
 *
 * Either way the merge rules below are the same, and they are the part that matters:
 * re-planning refreshes a proposed plan but can never rewrite one that has been approved.
 */
const DATA_DIR = path.resolve(config.remediation.storeDir || path.join(process.cwd(), '.data'));
const STORE_PATH = path.join(DATA_DIR, 'remediation-plans.json');
const USE_DYNAMODB = Boolean(config.remediation.tableName);

/**
 * The file store is the only writer of its file, so it may cache. The table is shared by
 * every container, so caching there would reintroduce exactly the staleness the table
 * exists to remove - and at a handful of small items, reading every time is free.
 */
let cache = null;
let writeChain = Promise.resolve();

/**
 * Statuses a plan does not come back from on its own. Re-planning rebuilds these rather
 * than freezing them: there is no approval left in flight to protect, and the issue being
 * planned for is one AWS is reporting right now.
 */
const SETTLED_STATUSES = new Set(['verified', 'executed', 'failed']);

/** Whether a fresh computation would produce a different change from the frozen one. */
function hasDrifted(existing, recomputed) {
  return JSON.stringify(existing.parameters ?? null) !== JSON.stringify(recomputed.parameters ?? null);
}

async function readAll() {
  if (USE_DYNAMODB) return dynamo.readAll();
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
  if (USE_DYNAMODB) return dynamo.persist(plans);
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

    // A plan only reaches re-planning when its issue is being detected right now, because
    // that is the only thing the planner builds from. So a settled plan that turns up here
    // has been overtaken by reality - the fix it applied is no longer holding, or the lab
    // was reset underneath it - and continuing to show it as verified would be a claim the
    // environment contradicts. It goes back to proposed, carrying what it did last time.
    if (SETTLED_STATUSES.has(existing.status)) {
      plans[index] = {
        ...plan,
        createdAt: existing.createdAt,
        previousOutcome: {
          status: existing.status,
          outcome: existing.outcome ?? null,
          executedAt: existing.executedAt ?? null,
          approvedBy: existing.approval?.approvedBy ?? null,
          note: 'This issue was detected again after the plan settled, so the plan was rebuilt.',
        },
      };
      continue;
    }

    if (existing.status !== 'proposed') {
      // An approval in flight is frozen. Re-planning must not swap the parameters
      // underneath an approval that was given for different ones - the approval refers to
      // that exact change, not to whatever the rule computes next.
      plans[index] = { ...existing, supersededBy: { recomputedAt: plan.createdAt, differs: hasDrifted(existing, plan) } };
      continue;
    }

    plans[index] = { ...plan, createdAt: existing.createdAt };
  }
  if (!USE_DYNAMODB) cache = plans;
  await persist(plans);
  return plans;
}

export async function updatePlan(id, mutate) {
  const plans = await readAll();
  const index = plans.findIndex((plan) => plan.id === id);
  if (index === -1) return null;
  plans[index] = mutate({ ...plans[index] });
  if (!USE_DYNAMODB) cache = plans;
  await persist(plans);
  return plans[index];
}

export async function clearPlans() {
  if (!USE_DYNAMODB) cache = [];
  await persist([]);
}

/** Where plans are actually being kept, for the API to report honestly. */
export function describeStore() {
  return USE_DYNAMODB
    ? dynamo.describeBackend()
    : { backend: 'file', path: STORE_PATH, durable: false };
}

export { STORE_PATH };
