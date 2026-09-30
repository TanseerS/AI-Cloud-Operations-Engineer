# AICOE Lab Environment

A deliberately small, low-cost AWS environment carrying **five intentional issues** that
the AI Cloud Operations Engineer must discover, analyze and fix. Every resource is real
AWS infrastructure — there is no mock data anywhere in this lab.

## Region: `us-east-1`

Chosen in the first build after inspecting all 17 enabled regions in account
`303670280486`. Only two regions held resources:

| Region | Lambda | DynamoDB | API GW | S3 | Most recent activity |
|---|---|---|---|---|---|
| `us-east-1` | 11 | 4 | 0 | 6 | 2026-09-19 |
| `ap-south-1` | 3 | 0 | 2 | 2 | 2026-07-27 |

`us-east-1` holds the bulk of existing workloads, the most recent activity, and the
closest predecessor to this project (the `opspilot-showcase-*` stack). Bedrock is
available in both, so model access was not a tiebreaker.

## Resources

All names use the `aicoe-lab` prefix.

| Resource | Name | Notes |
|---|---|---|
| Lambda (healthy) | `aicoe-lab-function` | Python 3.13, arm64, 3008 MB, 5s |
| Lambda (failing) | `aicoe-lab-error-function` | Python 3.13, arm64, 128 MB, 300s |
| IAM role | `aicoe-lab-function-role` | Inline `aicoe-lab-logs-write` |
| IAM role | `aicoe-lab-error-function-role` | Inline `aicoe-lab-error-logs-write` |
| Log group | `/aws/lambda/aicoe-lab-function` | Retention **3653 days** (issue 2) |
| Log group | `/aws/lambda/aicoe-lab-error-function` | Retention 14 days (correct) |
| HTTP API | `aicoe-lab-api` (`1t6mt8jl5k`) | `GET /status`, `$default` stage |
| SSM parameters | `/aicoe-lab/baseline/*` | 7 parameters, all Standard tier |

Endpoint: `https://1t6mt8jl5k.execute-api.us-east-1.amazonaws.com/status`

Each execution role is scoped to `logs:CreateLogStream` and `logs:PutLogEvents` on its own
log group only. Roles are deliberately least-privilege so that IAM is never confused for
one of the seeded issues.

### Function behaviour

`aicoe-lab-function` returns a static payload — deterministic, so validation never depends
on timing or external state:

```json
{ "status": "ok", "service": "aicoe-lab" }
```

`aicoe-lab-error-function` needs `DOWNSTREAM_ENDPOINT` and `DOWNSTREAM_API_KEY` to reach
its simulated dependency. Neither is set, so every invocation logs a structured
`configuration_error` and raises `ConfigurationError`. Deterministic 100% failure.

Both sources live under `infrastructure/lab/` and were verified byte-identical to the
deployed packages.

## The five intentional issues

| ID | Category | Severity | Resource | Intended | Broken |
|---|---|---|---|---|---|
| 001 | cost-efficiency | medium | `aicoe-lab-function` `MemorySize` | 128 MB | **3008 MB** |
| 002 | cost-efficiency | low | main log group `retentionInDays` | 14 | **3653** |
| 003 | reliability | high | `aicoe-lab-error-function` env vars | 2 vars set | **unset** |
| 004 | reliability | high | `GET /status` | HTTP 200 | **HTTP 500** |
| 005 | architecture-config | medium | `aicoe-lab-error-function` `Timeout` | 5s | **300s** |

### 001 — Lambda memory over-provisioned 23.5x

Live CloudWatch REPORT line:

```
REPORT Duration: 2.17 ms  Billed Duration: 84 ms  Memory Size: 3008 MB  Max Memory Used: 35 MB
```

~1.2% utilisation. Every billed millisecond costs ~23.5x what it needs to.

**Detect:** `lambda:GetFunctionConfiguration` → `MemorySize`, or compare `Max Memory Used`
with `Memory Size` in the REPORT line.
**Fix:** `UpdateFunctionConfiguration` with `MemorySize: 128`.

### 002 — Log retention set to 10 years

3653 days on a stateless lab function — 260x longer than needed, accruing CloudWatch Logs
storage cost indefinitely. The error function's log group is correctly at 14 days, so the
contrast is visible within the lab itself.

**Detect:** `logs:DescribeLogGroups` → `retentionInDays`.
**Fix:** `logs:PutRetentionPolicy` with `retentionInDays: 14`.

### 003 — Failing Lambda: required configuration missing

Every invocation emits a structured error log naming exactly what is missing, then raises:

```json
{"event": "configuration_error", "service": "aicoe-lab",
 "missing_environment_variables": ["DOWNSTREAM_ENDPOINT", "DOWNSTREAM_API_KEY"],
 "remediation": "set the listed environment variables on the function configuration"}
```

```
[ERROR] ConfigurationError: aicoe-lab: required environment variables are not configured:
        DOWNSTREAM_ENDPOINT, DOWNSTREAM_API_KEY
```

**Detect:** `lambda:Invoke` → `FunctionError: Unhandled`; `errorType: ConfigurationError`;
CloudWatch `AWS/Lambda` `Errors` equals `Invocations`.
**Fix:** set both environment variables.

### 004 — API endpoint fails on every request

```
GET /status -> HTTP 500  {"message":"Internal Server Error"}
GET /nope   -> HTTP 404                      (control: routing is fine)
```

The 404 control proves the failure is the integration target, not routing. Note that an
HTTP API surfaces an unhandled integration error as **500**; a REST API would return 502.

**Detect:** HTTP call, or `AWS/ApiGateway` 5xx count equal to request count for ApiId
`1t6mt8jl5k`, correlated with `Errors` on `aicoe-lab-error-function`.
**Fix:** resolve issue 003 — the route then returns 200.

### 005 — Function timeout 30x its caller's timeout

`aicoe-lab-error-function` has a 300 second timeout while the API Gateway integration in
front of it gives up after 10 seconds. A hung invocation keeps billing for up to 290
seconds after the client response was already abandoned, and holds concurrency in an
account whose **total** Lambda concurrency limit is 10.

**Detect:** `lambda:GetFunctionConfiguration` → `Timeout` (300) against
`apigatewayv2:GetIntegration` → `TimeoutInMillis` (10000).
**Fix:** `UpdateFunctionConfiguration` with `Timeout: 5`.

> Reserved concurrency was the original candidate for issue 005. It is not usable here:
> this account's total Lambda concurrency limit is 10, and AWS refuses any reservation
> that would drop unreserved concurrency below 10.

## Baseline / reset data

SSM Parameter Store is the source of truth, split one parameter per issue so every value
stays inside the free Standard tier's 4096-character limit:

```
/aicoe-lab/baseline/lab                              lab metadata + resource inventory
/aicoe-lab/baseline/index                            pointer index over the issues
/aicoe-lab/baseline/issues/aicoe-lab-issue-001..005  one per intentional issue
```

Each issue parameter carries `intended_value`, `broken_value`, a `detection` block, a
`remediation` block (how to fix) and a `reset` block (the exact API call and parameters
that restore the broken state). A reset mechanism can enumerate
`/aicoe-lab/baseline/issues/` and replay each `reset` block without any other knowledge.

Snapshots for review live in `infrastructure/lab/baseline/`. SSM remains authoritative —
read it at runtime, not the files.

The reset mechanism itself is intentionally **not built yet**.

## Tags

Applied to all 14 lab resources:

```
Project     = ai-cloud-operations-engineer
Environment = lab
ManagedBy   = aicoe
Purpose     = hackathon
```

## Cost profile

No NAT Gateway, RDS, EC2, EKS, ECS, EventBridge rule, provisioned concurrency, or load
generator — all verified absent by API call. The only billable activity is manual
invocation. The public endpoint is throttled to 5 req/s (burst 5) as a deliberate
guardrail on a demo URL; that throttle is a safety control, not one of the issues.

## Validation

All checks run against live AWS after implementation — **18 passed, 0 failed**.

| # | Check | Result |
|---|---|---|
| 1a | Both lab Lambda functions exist | PASS |
| 1b | Both IAM execution roles exist | PASS |
| 1c | Both CloudWatch log groups exist | PASS |
| 1d | HTTP API with route, integration and stage exists | PASS |
| 1e | 7 baseline parameters exist | PASS |
| 2/3 | Normal Lambda invokes, returns expected payload | PASS |
| 4 | Error Lambda fails with `ConfigurationError` | PASS |
| 5 | `GET /status` returns 500; `/nope` returns 404 | PASS |
| 6a | Logs generated for the normal function | PASS |
| 6b | Logs generated for the error function | PASS |
| 6c | Structured `configuration_error` lines present | PASS |
| 7 | Excessive retention present (3653 days) | PASS |
| 8 | Memory issue preserved (3008 MB) | PASS |
| 9 | Timeout mismatch present (300s vs 10s) | PASS |
| 10a | Baseline `broken_value` matches live state, all 5 issues | PASS |
| 10b | Every issue carries remediation + reset blocks | PASS |
| 11 | All 14 resources carry the 4 required tags | PASS |
| 12 | 11 unrelated Lambdas and 2 unrelated APIs untouched | PASS |
| 13 | No continuously-running or expensive resources | PASS |

Lambda invocations used: 2 direct plus 1 via the API. No load generation was configured.
