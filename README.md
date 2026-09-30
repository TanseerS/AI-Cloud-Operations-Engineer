# AI Cloud Operations Engineer

An autonomous agent that inspects a live AWS account, finds real configuration, cost and
reliability problems, and proposes or applies fixes.

## Status

Early build. The controlled AWS lab the agent will practise against is up with five
seeded issues; the agent itself is not built yet.

| Stage | State |
|---|---|
| Lab environment (5 seeded issues) | Done |
| Reset mechanism | Not started |
| Detection / remediation agent | Not started |

## Repository layout

```
docs/                          Project documentation
infrastructure/lab/
  function/                    Healthy Lambda source
  error-function/              Deliberately failing Lambda source
  baseline/                    Snapshots of the SSM baseline and issue definitions
```

## The lab

Five intentional issues across two Lambdas, their log groups and an HTTP API in
`us-east-1`:

| ID | Issue | Detected from |
|---|---|---|
| 001 | Lambda memory 3008 MB for a ~36 MB workload | `GetFunctionConfiguration`, REPORT line |
| 002 | Log retention set to 3653 days | `DescribeLogGroups` |
| 003 | Failing Lambda: required env vars unset | `Invoke`, CloudWatch Logs |
| 004 | `GET /status` returns 500 on every request | HTTP call, API Gateway 5xx metric |
| 005 | Function timeout 300s vs 10s integration timeout | `GetFunctionConfiguration` + `GetIntegration` |

Baselines, remediation and reset instructions live in SSM Parameter Store under
`/aicoe-lab/baseline/`.

See [docs/lab-environment.md](docs/lab-environment.md) for the full resource inventory,
the region rationale, per-issue detection and remediation detail, and validation results.

## AWS account

Account `303670280486`, region `us-east-1`. All lab resources use the `aicoe-lab` prefix
and are tagged `Project=ai-cloud-operations-engineer`, `Environment=lab`,
`ManagedBy=aicoe`, `Purpose=hackathon`.
