import { resetLab } from '../services/lab.service.js';

/**
 * Scheduled lab management.
 *
 * Invoked by EventBridge Scheduler. It calls the same resetLab service the manual
 * endpoint calls - there is one implementation of the reset, so the autonomous and
 * manual paths cannot drift apart.
 *
 * Deterministic by design: the decision to change anything comes from comparing live AWS
 * configuration against the recorded baseline. No model is consulted, and this function's
 * execution role holds no Bedrock permission at all, so it could not invoke one.
 */

// A ceiling inside the function's own timeout, so a stuck AWS call returns a recorded
// failure rather than an opaque Lambda timeout with no audit entry.
const RUN_BUDGET_MS = 110_000;

function timeout(ms) {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Autonomous run exceeded its ${ms}ms budget`)), ms);
    timer.unref?.();
  });
}

export async function handler(event) {
  const startedAt = new Date().toISOString();

  try {
    const result = await Promise.race([resetLab({ trigger: 'scheduled' }), timeout(RUN_BUDGET_MS)]);

    // One structured line per run. Duration and whether AWS was written are the two
    // things worth being able to grep for later.
    console.log(
      JSON.stringify({
        level: result.status === 'failed' ? 'error' : 'info',
        message: 'autonomous lab check complete',
        trigger: 'scheduled',
        status: result.status,
        alreadyAtBaseline: result.alreadyAtBaseline,
        awsModificationsMade: result.changesApplied.length > 0,
        changesApplied: result.changesApplied.length,
        resourcesEvaluated: result.summary?.resourcesEvaluated ?? 0,
        verificationPassed: result.verification?.passed ?? null,
        durationMs: result.durationMs,
        errors: (result.errors ?? []).length,
      }),
    );

    return {
      trigger: 'scheduled',
      status: result.status,
      alreadyAtBaseline: result.alreadyAtBaseline,
      resetRequired: result.changesApplied.length > 0,
      changesApplied: result.changesApplied,
      summary: result.summary,
      verification: { passed: result.verification?.passed ?? null, issuesDetected: result.verification?.issuesDetected ?? [] },
      durationMs: result.durationMs,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      errors: result.errors ?? [],
    };
  } catch (error) {
    // Fail safe: report and stop. Nothing is retried here, so a persistent fault cannot
    // turn into repeated writes against the lab.
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'autonomous lab check failed',
        trigger: 'scheduled',
        error: error.message,
        startedAt,
      }),
    );
    return { trigger: 'scheduled', status: 'failed', awsModificationsMade: false, error: error.message, startedAt };
  }
}

export default handler;
