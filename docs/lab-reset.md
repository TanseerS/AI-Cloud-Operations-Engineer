# Lab reset

`POST /api/v1/lab/reset` · `GET /api/v1/lab/status`

Restores the environment to the intentionally broken baseline so the walkthrough can be
run again from the same starting point.

## It uses the baseline that already exists

The baseline was recorded at lab setup as SSM parameters under
`/aicoe-lab/baseline/issues/` — one per intentional issue, each with the intended value,
the seeded broken value and a reset block. This feature reads that. It does not define a
second baseline.

| Issue | Managed attribute | Baseline value |
|---|---|---|
| `aicoe-lab-issue-001` | `aicoe-lab-function` MemorySize | 3008 |
| `aicoe-lab-issue-002` | `/aws/lambda/aicoe-lab-function` retentionInDays | 3653 |
| `aicoe-lab-issue-003` | `aicoe-lab-error-function` Environment.Variables | none set |
| `aicoe-lab-issue-005` | `aicoe-lab-error-function` Timeout | 300 |
| `aicoe-lab-issue-004` | — | restored indirectly by 003; it has no configuration of its own |

## The baseline is data, and data can be tampered with

SSM parameters are writable by anyone with account access, so the reset engine **never
executes `reset.api` as a string**. The action is derived from the target's type and
attribute and mapped onto the same allowlist the remediation layer uses, and the
baseline's declared operation is then cross-checked against what that mapping produces.
A mismatch is rejected and reported, not trusted.

Verified by tampering with the live baseline: an entry rewritten to declare
`iam:DeleteRole` was rejected with *"the baseline declares iam:DeleteRole but this target
maps to lambda:UpdateFunctionConfiguration"*, and never executed.

## Idempotency

Each managed attribute is read from AWS and compared against the baseline before anything
is written. Only differences are written.

| Lab state | Behaviour |
|---|---|
| Already broken | 4 evaluated, **0 AWS calls**, verification confirms baseline |
| Fully fixed | Only the differing attributes are restored |
| Partially fixed | Only the differing attributes are restored; the rest report `already-at-baseline` |

## Lab-only safety

Targets come from AWS discovery, which is itself scoped to the lab, and each one is
re-checked through the same safety gate the remediation layer uses — required tags,
naming convention, region, allowlisted action, parameter ranges. The caller supplies
nothing: the endpoint takes no body.

Verified by pointing the baseline at a real non-lab function
(`opspilot-showcase-api`): it was skipped with *"the resource is not present in the
discovered lab inventory, so it was not touched"*, and that function was confirmed
unmodified afterwards.

## No cooldown, but no duplicate writes

The endpoint is meant to be reachable by anyone demonstrating the lab, so there is
deliberately **no rate limit or cooldown**. Concurrency is handled server-side instead:
simultaneous callers join the single in-flight run and all receive the same result, so
the same resource can never be written twice.

Verified with three simultaneous requests against a lab with two attributes off baseline:
one run executed, two joined it, **two restores total** rather than six.

## Cost

Reset only updates configuration on resources that already exist. `resourcesCreated: 0`
and `resourcesDeleted: 0` are part of every response. No EC2, RDS, NAT gateway or load
balancer is ever involved — confirmed absent after validation.

## Verification

1. Every managed attribute is read back from AWS and compared to the baseline.
2. The issue detector is re-run over live CloudWatch and configuration.
3. The intentional issues must be detected again for the reset to pass.

## Dashboard

The control lives on the Overview page as "Lab control". It shows what the baseline
manages, asks for confirmation — *"This restores the AWS lab to its intentionally broken
baseline for demonstration."* — then shows resources checked, changes applied as
before → after values, issues restored and the verification status. When nothing differs
it says **"Lab already at baseline"**.

A successful reset bumps a shared refresh token, so every mounted page reloads its AWS
data and the dashboard immediately reflects the restored environment.
