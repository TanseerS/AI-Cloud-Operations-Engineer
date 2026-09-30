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
| Reset mechanism | Not started |
| Bedrock reasoning | Not started |
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
    context/             App-wide API health, polled once
    hooks/               Theme and API-resource hooks
    lib/                 Config and the single API client
    pages/               One page per workspace section
    styles/              Design tokens, base reset, component styles
docs/                    Project documentation
infrastructure/lab/      AWS lab sources and issue baselines
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
| GET | `/api/v1/health` | Available |
| GET | `/api/v1` | Available - lists the capability surface |
| GET | `/api/v1/infrastructure/resources` | Available - live AWS inventory |
| GET | `/api/v1/architecture/graph` | Available - topology derived from discovery |
| GET | `/api/v1/costs` | Available - Cost Explorer analysis |
| GET | `/api/v1/health/analysis` | Available - CloudWatch health & findings |
| GET | `/api/v1/bedrock/analysis` | 501 |
| POST | `/api/v1/remediation` | 501 |
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

## The lab

Five intentional AWS issues in `us-east-1` for the agent to find. See
[docs/lab-environment.md](docs/lab-environment.md).

## AWS account

Account `303670280486`, region `us-east-1`. Lab resources use the `aicoe-lab` prefix and
are tagged `Project=ai-cloud-operations-engineer`, `Environment=lab`, `ManagedBy=aicoe`,
`Purpose=hackathon`.
