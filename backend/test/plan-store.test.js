import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * The merge rules in the plan store decide what a plan is allowed to claim after
 * re-planning. Both directions matter and they pull against each other:
 *
 *   an approval in flight must be frozen, or re-planning could swap the parameters
 *   underneath a human's approval;
 *
 *   a settled plan must not be frozen, or the dashboard goes on reporting a fix as
 *   verified while AWS is reporting the issue it supposedly resolved.
 *
 * Config is read once at import, so the store directory is redirected before loading it.
 */
const STORE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'aicoe-plan-store-'));
process.env.REMEDIATION_STORE_DIR = STORE_DIR;
delete process.env.REMEDIATION_TABLE_NAME;

const store = await import('../src/services/remediation/store.js');

test.after(async () => {
  await fs.rm(STORE_DIR, { recursive: true, force: true });
});

const PLAN_ID = 'plan--lambda-memory-over-provisioned--aicoe-lab-function';

function plan(overrides = {}) {
  return {
    id: PLAN_ID,
    issueId: 'lambda-memory-over-provisioned--aicoe-lab-function',
    status: 'proposed',
    createdAt: '2026-10-01T00:00:00.000Z',
    parameters: { FunctionName: 'aicoe-lab-function', MemorySize: 128 },
    ...overrides,
  };
}

test.beforeEach(async () => {
  await store.clearPlans();
});

test('the file store uses a configurable directory rather than the package', () => {
  assert.ok(store.STORE_PATH.startsWith(STORE_DIR), `store path was ${store.STORE_PATH}`);
  assert.equal(store.describeStore().backend, 'file');
});

test('re-planning refreshes a proposed plan and keeps its original createdAt', async () => {
  await store.upsertPlans([plan()]);
  await store.upsertPlans([
    plan({ createdAt: '2026-10-02T00:00:00.000Z', parameters: { FunctionName: 'aicoe-lab-function', MemorySize: 192 } }),
  ]);

  const stored = await store.getPlan(PLAN_ID);
  assert.equal(stored.parameters.MemorySize, 192, 'a proposed plan should pick up the fresh computation');
  assert.equal(stored.createdAt, '2026-10-01T00:00:00.000Z', 'createdAt should record when the plan first appeared');
});

test('an approved plan is frozen: re-planning cannot swap its parameters', async () => {
  await store.upsertPlans([plan()]);
  await store.updatePlan(PLAN_ID, (existing) => ({
    ...existing,
    status: 'approved',
    approval: { approvedBy: 'someone', awsCallsMade: 0 },
  }));

  await store.upsertPlans([plan({ parameters: { FunctionName: 'aicoe-lab-function', MemorySize: 1024 } })]);

  const stored = await store.getPlan(PLAN_ID);
  assert.equal(stored.status, 'approved', 'approval must survive re-planning');
  assert.equal(stored.parameters.MemorySize, 128, 'the approved parameters must not change');
  assert.equal(stored.supersededBy.differs, true, 'the drift should be recorded rather than applied');
});

test('a settled plan is rebuilt when its issue is detected again', async () => {
  for (const settled of ['verified', 'executed', 'failed']) {
    await store.clearPlans();
    await store.upsertPlans([plan()]);
    await store.updatePlan(PLAN_ID, (existing) => ({
      ...existing,
      status: settled,
      outcome: settled,
      executedAt: '2026-10-01T01:00:00.000Z',
      approval: { approvedBy: 'someone', awsCallsMade: 0 },
    }));

    // The planner only builds plans for issues AWS is reporting now, so this plan
    // arriving again means the problem is back.
    await store.upsertPlans([plan()]);

    const stored = await store.getPlan(PLAN_ID);
    assert.equal(stored.status, 'proposed', `a ${settled} plan must not keep claiming that state`);
    assert.equal(stored.previousOutcome.status, settled, 'what happened last time should be retained');
    assert.equal(stored.previousOutcome.approvedBy, 'someone');
  }
});

test('clearing removes every plan', async () => {
  await store.upsertPlans([plan(), plan({ id: 'plan--log-retention-excessive--x' })]);
  assert.equal((await store.listPlans()).length, 2);
  await store.clearPlans();
  assert.deepEqual(await store.listPlans(), []);
});
