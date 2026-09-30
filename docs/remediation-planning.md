# Remediation planning

`POST /api/v1/remediation/plan` · `GET /api/v1/remediation/plans` ·
`POST /api/v1/remediation/plans/:id/approve`

**Planning only.** No endpoint in this layer calls a mutating AWS API, and approving a
plan changes a status field and nothing else. Execution is a separate capability.

## The caller cannot choose a target

This is the property everything else rests on. The request body may name issue ids and
nothing more. A request carrying `resourceId`, `resourceArn`, `action`, `actionType`,
`parameters`, `awsOperation` or `command` is rejected with `caller_supplied_target`
before any work happens.

Every resource, action and parameter is re-derived from a fresh discovery of AWS during
the request. There is no code path by which an ARN from a browser becomes a target, so
"don't accept an arbitrary ARN" is structural rather than a rule someone has to remember.

## The action allowlist

`backend/src/services/remediation/registry.js` is the only place an AWS mutation can be
described. Each entry names exactly one AWS operation and computes its parameters from
measured evidence.

| Issue rule | Action type | AWS operation | Risk |
|---|---|---|---|
| `lambda-memory-over-provisioned` | `lambda:update-memory` | `lambda:UpdateFunctionConfiguration` | low |
| `lambda-timeout-exceeds-caller` | `lambda:update-timeout` | `lambda:UpdateFunctionConfiguration` | low |
| `log-retention-excessive` | `logs:update-retention` | `logs:PutRetentionPolicy` | medium |

Targets are derived, not looked up in the lab baseline, so the logic generalises:

- **Memory** — 3x the observed peak, rounded up to a 64 MB boundary, floored at 128 MB.
  37 MB peak → 128 MB, down from 3008.
- **Timeout** — one second inside the caller's own timeout, so the function fails before
  the caller abandons the request. 10s caller → 9s, down from 300.
- **Retention** — the nearest value CloudWatch accepts to a 14-day operational window.

Retention is rated **medium** risk, not low: applying a shorter retention deletes events
older than it, and the rollback restores the setting but cannot restore the events. The
plan carries that as an explicit warning.

## Recommendation-only

An issue with no registry entry becomes a plan that says so and explains why. Inventing
an action would be worse than admitting the gap.

| Issue | Why it is not automated |
|---|---|
| `lambda-error-rate` | An error rate has many possible causes. No single AWS change follows safely from the rate alone. |
| `api-5xx-errors` | The API is reporting its integration target's failure. The fix belongs to the target; an API-level change would hide the fault. |
| `log-errors-present` | Log entries are evidence of a fault, not a misconfiguration. No AWS operation makes application errors stop. |

## Safety gate

Seven checks, all of which must pass before a plan is executable. Each is reported
individually, so a rejection names the check that failed.

1. Target was discovered from AWS during this request
2. Target name matches the `aicoe-lab` convention
3. Target carries `Project=ai-cloud-operations-engineer`, `Environment=lab`, `ManagedBy=aicoe`
4. Target is in the configured region
5. Action type is in the backend allowlist
6. Parameters are within their allowed range — Lambda memory 128–10240 MB, timeout
   1–900s, retention one of the values CloudWatch accepts
7. A rollback restoring the observed value is recorded

Verified against a production-shaped resource, a resource missing one tag, a correctly
tagged resource whose name is outside the convention, a wrong region, a non-allowlisted
action, out-of-range parameters, and a missing resource. Only the real lab resource with
an allowlisted action passes.

## Bedrock's role

Advisory only. If a recent analysis is cached, its root-cause reasoning is attached to
the plan's audit record, labelled as advisory. Planning never triggers a billed
invocation on its own.

The model cannot choose, alter or add an action. Actions come from the registry, and the
safety gate re-validates the action type and parameters regardless of what any reasoning
says.

## Approval and immutability

Approval moves `proposed` → `approved` and records who, when, and that zero AWS calls
were made. A recommendation-only plan cannot be approved (409). An already-approved plan
cannot be re-approved (409).

An approved plan is **frozen**. Re-planning cannot swap its parameters underneath the
approval — the approval refers to that exact change, not to whatever the rule computes
next. A later run records `supersededBy` noting whether a fresh computation would differ.

## Storage

A JSON file on the backend's own disk (`backend/.data/`, gitignored), written through a
temporary file so a crash cannot leave a half-written store. Not a database: plans are
small and few. Not AWS: writing them there would mean this planning stage modified the
account, which it must not.

The audit record holds the issue, the rule that detected it, the resource and how it was
verified, current and proposed configuration, the reason, the evidence, whether Bedrock
contributed, the safety checks, and the approval.
