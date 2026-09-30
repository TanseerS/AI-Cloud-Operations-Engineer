# AI Cloud Operations Engineer

An autonomous agent that inspects a live AWS account, finds real configuration, cost and
reliability problems, and proposes or applies fixes.

## Status

| Stage | State |
|---|---|
| Lab environment (5 seeded issues) | Done |
| Application foundation (frontend + API) | Done |
| AWS resource discovery | Done |
| Interactive architecture map | Done |
| Cost analysis | Done |
| CloudWatch health & issue detection | Done |
| Bedrock AI analysis | Done |
| Remediation planning & approval | Done |
| Remediation execution & verification | Done |
| Idempotent lab reset | Done |
| Autonomous scheduled lab management | Done |
| Unified operations dashboard | Done |
| Backend deployed to AWS | Done |
| Reset mechanism | Not started |
| Detection / remediation agent | Not started |

The application discovers the real AWS lab inventory end to end. The remaining analysis
endpoints answer `501 Not Implemented` until their module is built.

## Repository layout

```
backend/                 Node + Express API - the only tier that will hold AWS access
  src/
    config/              Every environment variable enters here and nowhere else
    routes/              Thin HTTP layer, one router per capability
    services/            Capability logic, kept out of route handlers
      aws/               SDK client factory and the reusable lab-resource filter
      discovery/         One collector per AWS service, registered in index.js
      architecture/      Relationship rules and the graph builder
      cost/              Cost Explorer queries, period maths, service mapping
      cloudwatch/        Bounded metric and log collection, log redaction
      health/            Fact model and the deterministic detection rules
      ai/                Bedrock client, analysis schema, context builder, prompt
      remediation/       Action allowlist, safety gate, plan storage, executors
      lab/               Baseline reader, restore-target mapping, shared audit
    lambda/              Scheduled autonomous lab manager entry point
    middleware/          Request logging, 404, error to response
    lib/                 Typed errors and small helpers
frontend/                React + Vite dashboard - never holds AWS credentials
  src/
    components/layout/   App shell, sidebar, top bar, page header
    components/ui/       Card, Badge, Button, StatTile, StatusIndicator, EmptyState, Icon
    components/infrastructure/  Service sections and expandable resource cards
    components/architecture/    Graph canvas, nodes, layout and detail panel
    components/cost/            Trend chart, service breakdown, cost drivers
    components/health/          Health score, severity tiles, issue cards, evidence
    components/ai/              Model status, AI findings, recommendation groups
    components/remediation/     Plan cards, current-to-proposed diff
    components/lab/             Lab reset control
    context/             App-wide API health, polled once
    hooks/               Theme and API-resource hooks
    lib/                 Config and the single API client
    pages/               One page per workspace section
    styles/              Design tokens, base reset, component styles
docs/                    Project documentation
infrastructure/lab/      AWS lab sources and issue baselines
infrastructure/automation/  Least-privilege IAM policies for the scheduler
```

## Running locally

Two terminals. The API must be up before the dashboard has anything to show.

```bash
# API - http://localhost:4000
cd backend
cp .env.example .env
npm install
npm run dev

# Dashboard - http://localhost:5180
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Port 5180 rather than Vite's default 5173, which tends to collide with other local
projects. `strictPort` is on, so a clash fails loudly instead of drifting to a port the
API's CORS list does not allow.

## API

Base path `/api/v1`. Only health is implemented.

| Method | Path | Status |
|---|---|---|
| GET | `/api/v1/overview` | Available - one composed snapshot for the dashboard |
| GET | `/api/v1/health` | Available |
| GET | `/api/v1` | Available - lists the capability surface |
| GET | `/api/v1/infrastructure/resources` | Available - live AWS inventory |
| GET | `/api/v1/architecture/graph` | Available - topology derived from discovery |
| GET | `/api/v1/costs` | Available - Cost Explorer analysis |
| GET | `/api/v1/health/analysis` | Available - CloudWatch health & findings |
| GET | `/api/v1/ai/status` | Available - model, region, policy (no Bedrock call) |
| POST | `/api/v1/ai/analyze` | Available - Bedrock analysis |
| POST | `/api/v1/remediation/plan` | Available - builds plans (no execution) |
| POST | `/api/v1/remediation/plans/:id/approve` | Available - state change only |
| POST | `/api/v1/remediation/plans/:id/execute` | Available - applies and verifies |
| GET | `/api/v1/lab/status` | Available - baseline summary |
| POST | `/api/v1/lab/reset` | Available - restores the broken baseline |

A scheduled AWS Lambda calls the same reset service every 6 hours.
| POST | `/api/v1/lab/reset` | 501 |

```console
$ curl -s localhost:4000/api/v1/health
{"status":"ok","service":"aicoe-api","version":"0.1.0","environment":"development",
 "region":"us-east-1","uptimeSeconds":2,"timestamp":"2026-09-30T05:43:37.003Z"}
```

## Credential boundary

The browser never holds AWS access. It talks only to this API over `VITE_API_BASE_URL`,
and the API resolves AWS credentials at call time from the standard provider chain -
shared config, environment, or an IAM role in deployment. No access key is read from a
config file, committed, or shipped in the frontend bundle.

The frontend has no AWS SDK dependency, and `.gitignore` keeps every `.env` out of the
repository except the `.env.example` templates.

## Design system

Documented in [docs/design-system.md](docs/design-system.md). One neutral ramp, one
accent, four semantic status colours, a 4px spacing scale, and light and dark themes
driven entirely by CSS custom properties.

## Resource discovery

`GET /api/v1/infrastructure/resources` returns the live inventory of lab resources across
Lambda, CloudWatch Logs, API Gateway, SSM Parameter Store and IAM. See
[docs/discovery.md](docs/discovery.md) for the response shape, the lab filter and the
partial-failure contract.

## Architecture map

`GET /api/v1/architecture/graph` turns the inventory into nodes and edges. Every edge is
derived from a field in a resource's own AWS configuration and is only drawn when the
target was itself discovered, so the diagram never points at something unverified. See
[docs/architecture-graph.md](docs/architecture-graph.md).

## Cost analysis

`GET /api/v1/costs` reports usage cost and net billed cost separately, because credits
make them different numbers. Billing data is never presented as live. See
[docs/cost-analysis.md](docs/cost-analysis.md).

## Health and issue detection

`GET /api/v1/health/analysis` collects CloudWatch metrics, log samples and configuration
as **facts**, then runs deterministic rules over them to produce **issues** that cite the
facts behind them. No model is involved. See
[docs/health-analysis.md](docs/health-analysis.md).

## AI analysis

`POST /api/v1/ai/analyze` asks a Bedrock model, acting as an AWS Cloud Operations
Engineer, to reason over the observations the application already collected. Model
selection was measured rather than assumed, the response is schema-validated, and every
issue and resource it names is checked against what was actually discovered — anything
else is rejected before display. See [docs/ai-analysis.md](docs/ai-analysis.md).

## Remediation planning

`POST /api/v1/remediation/plan` turns detected issues into single, reversible AWS changes.
The caller cannot name a target: every resource, action and parameter is re-derived from
AWS by the backend, and only allowlisted actions against correctly tagged lab resources
become executable plans. Approval marks a plan ready; it executes nothing. See
[docs/remediation-planning.md](docs/remediation-planning.md).

## Remediation execution

`POST /api/v1/remediation/plans/:id/execute` applies an approved plan and verifies it.
Every mutating AWS command in the codebase lives in one file, in three named functions —
there is no generic command dispatcher. Verification reads the resource back from AWS and
re-runs the detector; a successful API response is never treated as success on its own.
See [docs/remediation-execution.md](docs/remediation-execution.md).

## Lab reset

`POST /api/v1/lab/reset` restores the intentionally broken baseline. It compares each
managed setting against the baseline recorded at lab setup and writes back only what
differs, so resetting an already-broken lab makes no AWS calls at all. No cooldown —
concurrency is handled server-side. See [docs/lab-reset.md](docs/lab-reset.md).

## Autonomous lab management

EventBridge Scheduler invokes a Lambda every 6 hours that calls the *same* reset service
as the manual endpoint. It is deterministic — the execution role holds no Bedrock
permission at all — idempotent, and scoped by IAM to the lab resources the baseline
manages. See [docs/autonomous-lab-management.md](docs/autonomous-lab-management.md).

## The lab

Five intentional AWS issues in `us-east-1` for the agent to find. See
[docs/lab-environment.md](docs/lab-environment.md).

## Deployment

The backend runs as an Express app on Lambda behind an API Gateway HTTP API. The public
endpoint is `https://fo7occiuh3.execute-api.us-east-1.amazonaws.com`. See [docs/deployment.md](docs/deployment.md) for the
architecture, the least-privilege role, the configuration surface and the build steps.

## AWS account

Account `303670280486`, region `us-east-1`. Lab resources use the `aicoe-lab` prefix and
are tagged `Project=ai-cloud-operations-engineer`, `Environment=lab`, `ManagedBy=aicoe`,
`Purpose=hackathon`.
