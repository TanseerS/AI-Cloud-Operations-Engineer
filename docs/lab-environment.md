# AICOE Lab Environment

A deliberately small, low-cost AWS environment that the AI Cloud Operations Engineer
will learn to inspect, diagnose and remediate. Every resource is real AWS
infrastructure — there is no mock data anywhere in this lab.

## Region: `us-east-1`

Chosen after inspecting all 17 enabled regions in account `303670280486`. Only two
regions hold any resources:

| Region | Lambda | DynamoDB | API GW | S3 | Most recent activity |
|---|---|---|---|---|---|
| `us-east-1` | 11 | 4 | 0 | 6 | 2026-09-19 |
| `ap-south-1` | 3 | 0 | 2 | 2 | 2026-07-27 |

`us-east-1` wins on three counts: it holds the bulk of existing workloads, it holds the
most recent activity, and it already hosts the closest predecessor to this project (the
`opspilot-showcase-*` stack). Bedrock is available in both, so model access is not a
tiebreaker. The application will therefore be deployed to `us-east-1`.

## Resources

All names use the `aicoe-lab` prefix.

| Resource | Name | Notes |
|---|---|---|
| Lambda function | `aicoe-lab-function` | Python 3.13, arm64, 5s timeout |
| IAM role | `aicoe-lab-function-role` | Inline policy `aicoe-lab-logs-write` |
| CloudWatch log group | `/aws/lambda/aicoe-lab-function` | 14-day retention, pre-created |
| SSM parameter | `/aicoe-lab/baseline/aicoe-lab-function` | Baseline + issue definition |
| SSM parameter | `/aicoe-lab/baseline/index` | Enumerates recorded baselines |

The execution role is scoped to `logs:CreateLogStream` and `logs:PutLogEvents` on this
one log group only — deliberately least-privilege, so the over-provisioned memory stays
the *only* finding in the lab.

Cost profile: no NAT Gateway, RDS, EC2, EKS, VPC or recurring workload. The only billable
activity is a handful of manual Lambda invocations, all within the free tier.

### Function behaviour

Deterministic by design — the handler returns a static dict so validation never depends
on timing or external state:

```json
{ "status": "ok", "service": "aicoe-lab" }
```

Source of record: [`infrastructure/lab/lambda_function.py`](../infrastructure/lab/lambda_function.py),
verified byte-identical to the deployed package.

## Intentional issue #1 — over-provisioned Lambda memory

`aicoe-lab-issue-001`, category `cost-efficiency`, severity `medium`.

| | |
|---|---|
| Attribute | `MemorySize` |
| Intended | `128` MB |
| Deployed (broken) | `3008` MB |
| Over-provisioning | 23.5x |

Real CloudWatch REPORT lines from the validation invocations:

```
REPORT Duration: 2.00 ms  Billed Duration: 67 ms  Memory Size: 3008 MB  Max Memory Used: 35 MB  Init Duration: 64.27 ms
REPORT Duration: 2.35 ms  Billed Duration: 3 ms   Memory Size: 3008 MB  Max Memory Used: 37 MB
```

Roughly 1.2% memory utilisation. Every billed millisecond costs ~23.5x what it needs to,
with no latency benefit, which is exactly the signal the agent should learn to catch.

**Detection path:** compare `Max Memory Used` in the REPORT line against `Memory Size`,
or read `MemorySize` from `lambda:GetFunctionConfiguration`.

**Remediation:** `lambda:UpdateFunctionConfiguration` with `MemorySize: 128`, then confirm
the function still returns the expected payload.

## Baseline / reset data

The source of truth is SSM Parameter Store:

```
/aicoe-lab/baseline/aicoe-lab-function
```

It records the function name, region, account, runtime, role, log group, intended
configuration, the current intentionally-broken configuration, the expected response, and
for each issue both a `remediation` block (how to fix) and a `reset` block (how to
re-break it for the next run).

A snapshot lives at
[`infrastructure/lab/aicoe-lab-function.baseline.json`](../infrastructure/lab/aicoe-lab-function.baseline.json)
for review and diffing. SSM remains authoritative — read it at runtime, not the file.

The reset mechanism itself is intentionally **not built yet**; it is the next task.

## Tags

Applied to all five resources:

```
Project     = ai-cloud-operations-engineer
Environment = lab
ManagedBy   = aicoe
Purpose     = hackathon
```

## Validation

All checks run against live AWS after creation — 11 passed, 0 failed.

| # | Check | Result |
|---|---|---|
| 1 | Lambda function exists | PASS |
| 1b | State `Active`, LastUpdateStatus `Successful` | PASS |
| 2 | Invocation succeeds (200, no FunctionError) | PASS |
| 3 | Response matches expected payload exactly | PASS |
| 4 | Log group exists with 14-day retention | PASS |
| 4b | Lambda actually wrote log streams (role works) | PASS |
| 5 | Intentional issue present (`MemorySize` = 3008) | PASS |
| 6 | Baseline parameter stored and complete | PASS |
| 6b | Baseline index parameter stored | PASS |
| 7 | All 5 resources carry the 4 required tags | PASS |
| 8 | No ERROR events in the lab log group | PASS |

Total Lambda invocations used: 2, both for validation. No load generation was configured.
