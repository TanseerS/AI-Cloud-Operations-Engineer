# AI Cloud Operations Engineer

An autonomous agent that inspects a live AWS account, finds real configuration and cost
problems, and proposes or applies fixes.

## Status

Early build. The controlled AWS lab the agent will practise against is up; the agent
itself is not built yet.

| Stage | State |
|---|---|
| Lab environment (1 seeded issue) | Done |
| Reset mechanism | Not started |
| Detection / remediation agent | Not started |

## Repository layout

```
docs/             Project documentation
infrastructure/   AWS lab definitions, baselines and function source
```

## The lab

A single low-cost Lambda in `us-east-1`, seeded with one intentional problem —
`aicoe-lab-function` runs a trivial handler on 3008 MB of memory while using ~36 MB, a
23.5x over-provision that the agent should learn to detect and correct.

Baselines and reset data live in SSM Parameter Store under `/aicoe-lab/baseline/`.

See [docs/lab-environment.md](docs/lab-environment.md) for resources, the region
rationale, the issue definition and validation results.

## AWS account

Account `303670280486`, region `us-east-1`. All lab resources use the `aicoe-lab` prefix
and are tagged `Project=ai-cloud-operations-engineer`, `Environment=lab`,
`ManagedBy=aicoe`, `Purpose=hackathon`.
