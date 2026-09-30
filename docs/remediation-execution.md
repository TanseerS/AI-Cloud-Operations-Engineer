# Remediation execution and verification

`POST /api/v1/remediation/plans/:id/execute`

The first capability in this application that changes AWS.

## What can change AWS, and where it lives

Every mutating AWS command in the codebase is in one file,
`backend/src/services/remediation/executors.js`, in four call sites across three named
functions:

| Function | AWS command |
|---|---|
| `applyLambdaMemoryFix` | `UpdateFunctionConfiguration` (MemorySize only) |
| `applyLambdaTimeoutFix` | `UpdateFunctionConfiguration` (Timeout only) |
| `applyLogRetentionFix` | `PutRetentionPolicy` / `DeleteRetentionPolicy` |

There is deliberately **no** `executeAwsCommand(operation, params)`. A generic dispatcher
would make the set of possible mutations a runtime question; the point of this layer is
that the set can be read off the page. Dispatch is a frozen map keyed by the literal
allowlisted action types, with no default branch.

Adding a capability means writing a function here and registering it. Nothing else — not
configuration, not model output, not a request body — can introduce one.

## The request carries an id and nothing else

The stored plan is the only source of truth for what runs. No operation name, no
parameters, no target can be supplied by the caller.

## Re-validation at execution time

Approval is not evidence that the target is still safe. Everything is re-checked against
AWS as it is *now*:

1. Plan exists and its status is `approved`
2. Not already `verified`, not already executing
3. Resource re-discovered from AWS — discovery is itself scoped to the lab
4. Resource still carries `Project=ai-cloud-operations-engineer`, `Environment=lab`, `ManagedBy=aicoe`
5. Still matches the naming convention and the configured region
6. Action type still in the allowlist
7. Parameters still within range
8. Rollback still recorded

Any failure records `outcome: rejected` with the failing check names and
`awsChangeAttempted: false`.

## Before, action, after, verification

The before state is read from AWS immediately before the change and captures only the
fields the action can touch plus what is needed to judge the result. Environment variable
*values* are never read, so no secret can enter an audit record.

Lambda applies configuration changes asynchronously, so the executor polls
`LastUpdateStatus` until it settles. Reading straight back would otherwise return the
previous values and produce a false verification result.

Verification asks two independent questions, and **both** must pass:

- **Configuration readback** — does AWS now report the proposed configuration? Read back,
  not inferred from the call succeeding.
- **Detector re-run** — does the deterministic rule that found the issue still fire, over
  live CloudWatch and live configuration?

| Result | Status |
|---|---|
| Both pass | `verified` |
| AWS accepted the change but the detector still fires | `failed`, `outcome: verification_failed` |
| The resource does not hold the intended configuration | `failed` |
| AWS call errored | `failed`, `outcome: aws_error`, with the after state showing whether it partially landed |

A successful AWS API response is never on its own treated as success.

## Idempotency

- A `verified` plan is not executed again — the request returns `already_verified`.
- A second request while one is in flight is refused with `409 execution_in_progress`.
- If the resource already holds the desired state, no AWS call is made and the plan is
  settled from the observed state (`already_in_desired_state`).
- An approved plan is frozen, so a re-plan cannot swap its parameters underneath the
  approval.

## Audit

Each plan records the issue and the rule that detected it, the target and how it was
verified, `approvedAt`, `executedAt`, before and after states with their AWS source,
the execution result, the verification result and its evidence, and failure detail with
whether an AWS change was attempted.

## Validation performed against the live lab

| Test | Result |
|---|---|
| Unapproved plan | `409 not_approved`, no AWS call |
| Recommendation-only plan | `409 not_approved` |
| Nonexistent plan | `404` |
| Plan injected straight into storage targeting `production-payments` | `rejected` — resource-verified, lab-membership, required-tags all failed; no AWS call |
| Plan injected targeting a **real** non-lab function (`opspilot-showcase-api`) | `rejected`; that function verified untouched (512 MB, unmodified since August) |
| Two concurrent execute requests | one executed, the other `409 execution_in_progress` |
| Re-executing a verified plan | `already_verified`, `LastModified` unchanged |

Three remediations were executed for real and verified, then the lab was restored to its
seeded broken state using the reset instructions recorded in SSM.
