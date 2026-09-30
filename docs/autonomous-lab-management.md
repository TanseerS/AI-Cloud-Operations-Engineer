# Autonomous lab management

The lab keeps itself reproducible without anyone clicking anything.

```
EventBridge Scheduler  (rate(6 hours))
        ↓  invokes
aicoe-lab-autonomous-manager  (Lambda, nodejs22.x, arm64, 512 MB, 120s)
        ↓  calls
resetLab({ trigger: 'scheduled' })   ← the same service POST /api/v1/lab/reset calls
```

## One implementation, two triggers

There is no second copy of the reset logic. `lab.service.js` exposes the flow as named
phases and both paths run them:

| Phase | What it does |
|---|---|
| `validateLab()` | Loads the baseline, discovers the lab, returns what may be managed |
| `inspectState()` | Reads each managed attribute's live value and re-checks the lab tags |
| `calculateRequiredChanges()` | Pure comparison against the baseline — this is what makes it idempotent |
| *applyChanges* | Runs only for attributes that differ, through the allowlisted executors |
| `verify()` | Reads back from AWS and re-runs the issue detector |

The Lambda bundle is built from the same source with `npm run build:lambda`, so the manual
and autonomous paths cannot drift apart.

## The scheduler makes no model call

`usesBedrock: false` is not a claim in a config file — the execution role **holds no
Bedrock permission at all**, so the function could not invoke one if the code tried.
Verified against the live role: `grants_bedrock: false`, no `Action: "*"`, zero managed
policies attached. The decision to change anything comes from comparing live AWS
configuration against the recorded baseline.

## Least privilege

The execution role has ten statements. Reads span the `aicoe-lab-*` prefix; **writes are
narrower than reads on purpose** and cover only what the baseline actually manages:

| Write action | Resource |
|---|---|
| `lambda:UpdateFunctionConfiguration` | the two lab functions, by full ARN |
| `logs:PutRetentionPolicy`, `logs:DeleteRetentionPolicy` | the two lab log groups |
| `ssm:PutParameter` | one parameter — the automation audit record |
| `logs:Create*`, `logs:PutLogEvents` | its own log group |

Six actions need `Resource: "*"` because AWS does not support resource-level permissions
for them: `lambda:ListFunctions`, `logs:DescribeLogGroups`, `ssm:DescribeParameters`,
`iam:ListRoles`, `tag:GetResources`, `cloudwatch:GetMetricData`. All are read-only list
operations.

The scheduler's own role can do exactly one thing: `lambda:InvokeFunction` on that single
function ARN.

Policies live in `infrastructure/automation/` and are version-controlled.

## The automation is not part of the lab it manages

The scheduler's resources carry the project tags, because they belong to the project — but
they are tagged `Component=automation` and excluded from lab discovery.

Without that exclusion the manager appeared in its own inventory, and the dashboard
reported findings against it — an over-provisioned memory setting, a log group with no
retention, an error rate from its own failed deploys — that the reset baseline has no
entry for and the remediation workflow could never resolve. Issue count went from 6 to 10,
all four spurious. The exclusion is by tag, with a name-based fallback for resources whose
tags cannot be read.

## Idempotency

| Lab state | Behaviour |
|---|---|
| At baseline | 4 evaluated, **0 AWS writes** |
| Off baseline | Only the differing attributes restored |
| Concurrent runs | Callers join the single in-flight run; no permanent lock |

Retries are disabled on the schedule (`MaximumRetryAttempts: 0`) and the handler catches
its own failures, so a persistent fault reports and stops rather than repeatedly writing
to the lab. A 110-second internal budget sits inside the 120-second function timeout, so a
stuck AWS call produces a recorded failure rather than an opaque timeout.

## Shared audit

The Lambda runs in AWS and the manual reset runs in the API process, so neither sees the
other's memory. One SSM parameter, `/aicoe-lab/automation/state`, is the shared record: it
holds the last run, the last manual reset, the last autonomous check, the last autonomous
reset that actually changed something, and a five-entry history. An audit write failing
never turns a successful reset into a failed one.

Each run also logs one structured line with its duration and whether AWS was modified.

## Cost

EventBridge Scheduler is free at this volume. Four invocations a day of a 512 MB arm64
function that finishes in about three seconds is a fraction of a cent a month. Nothing is
created or deleted, no traffic is generated, no model is invoked, and there is no polling —
one scheduled execution per interval. Confirmed after deployment: zero EC2, RDS, NAT
gateways or load balancers in the account.

## Dashboard

`GET /api/v1/lab/status` reports live lab state derived from comparing every managed
attribute — `broken`, `fixed`, `partial` or `unknown` — alongside the automation history
and the current issue count. The Overview card shows it as a quiet strip. "Intentionally
broken" is styled as the *correct* state, because here it is.

Manual reset remains available at any time, with no cooldown.
