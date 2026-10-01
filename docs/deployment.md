# Deployment

The backend runs on AWS as a serverless API. Nothing in it runs when idle.

```
Browser
   ↓  HTTPS
AWS Amplify Hosting + CloudFront  (ai.tanseer.qd.je, ACM certificate)
   ↓  XHR to the API origin, no AWS credentials in the page
API Gateway HTTP API  (aicoe-api)
   ↓  Lambda proxy, $default route
Lambda  (aicoe-backend, nodejs22.x, arm64, 1024 MB, 60s)
   ↓  IAM execution role
Lambda · CloudWatch · API Gateway · Cost Explorer · SSM · DynamoDB · Bedrock
```

**Public application:** `https://ai.tanseer.qd.je`
**API endpoint:** `https://fo7occiuh3.execute-api.us-east-1.amazonaws.com`

## The Express app is reused, not rewritten

`backend/src/lambda/api.js` wraps `createApp()` with `serverless-http`. Every route,
middleware and service behaves identically to local development, so there is one
implementation to reason about and a local run stays representative of production.

The app is constructed once per container and reused across invocations, which keeps the
caches the discovery, cost, health and analysis services already maintain.

```bash
cd backend && npm run build:api          # esbuild bundle, @aws-sdk left to the runtime
cd ../build/api && zip -X ../aicoe-backend.zip index.mjs
aws lambda update-function-code --function-name aicoe-backend --zip-file fileb://build/aicoe-backend.zip
```

## Why two Lambdas

| Function | Purpose | Role |
|---|---|---|
| `aicoe-backend` | The public API | `aicoe-backend-role` |
| `aicoe-lab-autonomous-manager` | The 6-hourly scheduled lab check | `aicoe-lab-automation-role` |

They share the same service code but not the same role or availability. The scheduler
keeps the lab reproducible even if the API is down, and its role is narrower — it has no
Cost Explorer and no Bedrock permission at all.

## IAM

`infrastructure/deployment/backend-execution-policy.json`, 12 statements, no managed
policies, no `Action: "*"`, no AdministratorAccess.

Reads and writes are deliberately separated:

| | |
|---|---|
| **Read** | `aicoe-lab-*` functions, log groups, roles; `/aicoe-lab/*` parameters; API Gateway `GET` |
| **Write** | Only the two lab functions, the two lab log groups, one SSM audit parameter, and the plan table |
| **Bedrock** | `InvokeModel` on the two configured inference profiles and the foundation models they route to — nothing else |

Seven actions need `Resource: "*"` because AWS has no resource-level permission for them:
`lambda:ListFunctions`, `logs:DescribeLogGroups`, `ssm:DescribeParameters`,
`iam:ListRoles`, `tag:GetResources`, `cloudwatch:GetMetricData`, `ce:GetCostAndUsage`.
All are read-only.

## Bedrock

Verified by real invocation before configuring, in the deployment region:

| Model | Result |
|---|---|
| `us.amazon.nova-pro-v1:0` | works — configured |
| `us.amazon.nova-lite-v1:0` | works — fallback |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | `INVALID_PAYMENT_INSTRUMENT` |

The nova-pro profile routes to foundation models in us-east-1, us-east-2 and us-west-2,
so the policy grants `InvokeModel` on all three plus the profile itself. The model is set
by `BEDROCK_MODEL_ID`; no model id appears anywhere in the source.

## Configuration

All through Lambda environment variables — no secrets, and no credentials anywhere. The
SDK uses the execution role.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://ai.tanseer.qd.je`, plus the local dev ports |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-pro-v1:0` |
| `BEDROCK_FALLBACK_MODEL_IDS` | `us.amazon.nova-lite-v1:0` |
| `BEDROCK_REGION` | `us-east-1` |
| `REMEDIATION_TABLE_NAME` | `aicoe-remediation-plans` |
| `LAB_AUTOMATION_INTERVAL_HOURS` | `6` |

`AWS_REGION` is set by Lambda itself and is reserved, so it is not configured here.

## Where plans are stored

Plans began as a JSON file, which is the right shape for one process with its own disk. On
Lambda it is not. `/tmp` belongs to a container, so a plan approved on one container is
invisible to the next — and the symptom was visible in the UI: after executing and
verifying a fix, a later request served by a different container showed that fix as still
awaiting approval, quoting the pre-change value.

Nothing unsafe followed from it, because execution re-validates everything against AWS
regardless. But the approval record and the verification result *are* the audit trail, so
losing them is a correctness problem rather than a durability nicety.

Plans therefore live in a DynamoDB table, `aicoe-remediation-plans`, keyed by plan id and
billed on demand. At a handful of small items it costs effectively nothing and nothing runs
when the app is idle. With `REMEDIATION_TABLE_NAME` unset — local development — the store
falls back to a JSON file, so running locally needs no AWS resource at all.

## CORS

Owned by the Express `cors` middleware rather than API Gateway, so there is one place it
is decided. A permitted origin gets `access-control-allow-origin`; any other origin gets
no such header and the browser blocks the call. The origin list is configurable.

## Frontend

AWS Amplify Hosting app `aicoe-dashboard`, branch `main`, deployed by uploading the Vite
build rather than connecting a Git provider — the repository holds no deploy credentials
and there is no webhook to leak.

```bash
cd frontend
VITE_API_BASE_URL=https://fo7occiuh3.execute-api.us-east-1.amazonaws.com/api/v1 \
VITE_APP_ENV=production npx vite build
cd dist && zip -qr ../../build/dist.zip .
# aws amplify create-deployment → PUT the zip to zipUploadUrl → aws amplify start-deployment
```

`VITE_API_BASE_URL` is set at build time, not committed, so the same source builds for any
environment. Local development keeps its `http://localhost:4000/api/v1` default.

**SPA routing.** `infrastructure/deployment/amplify-custom-rules.json` rewrites any path
without a file extension to `/index.html` with status 200. Without it a refresh on
`/architecture` returns 404 — the default `404-200` rule does not survive Amplify's
trailing-slash redirect.

**Response headers.** `infrastructure/deployment/amplify-custom-headers.yml` sets HSTS,
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and a CSP whose
`connect-src` names the API origin explicitly. The CSP carries a sha256 hash for the one
inline script — the pre-paint theme bootstrap — rather than allowing `unsafe-inline`;
regenerate it if that script changes (the command is in the header file).

Amplify bakes custom headers into a deployment, so changing them requires a redeploy, not
just an `update-app`.

**Custom domain.** `ai.tanseer.qd.je`, an Amplify-managed ACM certificate, with the
validation CNAME and the app CNAME in the `tanseer.qd.je` Route 53 hosted zone.

## Cost

Everything is serverless and scales to zero. There is no EC2, RDS, NAT gateway, load
balancer, elastic IP or VPC endpoint in the account — verified across all 17 enabled
regions after deployment. API Gateway, Lambda, DynamoDB (on-demand) and EventBridge
Scheduler are billed per request; at demo volumes this is cents a month. Amplify is billed
per GB served and per build minute. Every application log group has 14-day retention.
