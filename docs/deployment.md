# Deployment

The backend runs on AWS as a serverless API. Nothing in it runs when idle.

```
Internet
   ↓  HTTPS
API Gateway HTTP API  (aicoe-api)
   ↓  Lambda proxy, $default route
Lambda  (aicoe-backend, nodejs22.x, arm64, 1024 MB, 60s)
   ↓  IAM execution role
Lambda · CloudWatch · API Gateway · Cost Explorer · SSM · Bedrock
```

**Public endpoint:** `https://fo7occiuh3.execute-api.us-east-1.amazonaws.com`

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

`infrastructure/deployment/backend-execution-policy.json`, 11 statements, no managed
policies, no `Action: "*"`, no AdministratorAccess.

Reads and writes are deliberately separated:

| | |
|---|---|
| **Read** | `aicoe-lab-*` functions, log groups, roles; `/aicoe-lab/*` parameters; API Gateway `GET` |
| **Write** | Only the two lab functions, the two lab log groups, and one SSM audit parameter |
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
| `REMEDIATION_STORE_DIR` | `/tmp/aicoe` |
| `LAB_AUTOMATION_INTERVAL_HOURS` | `6` |

`AWS_REGION` is set by Lambda itself and is reserved, so it is not configured here.

**One limitation stated plainly:** remediation plans are stored on the container's `/tmp`,
which does not survive a cold start. An approval can therefore be lost between approving
and executing if the container is recycled. Nothing unsafe follows — execution
re-validates everything against AWS regardless, and the plan is simply rebuilt. Making
approvals durable means a real store (DynamoDB, or SSM Advanced tier since the largest
plan is about 7 KB), which is a recurring cost this demo does not need.

## CORS

Owned by the Express `cors` middleware rather than API Gateway, so there is one place it
is decided. A permitted origin gets `access-control-allow-origin`; any other origin gets
no such header and the browser blocks the call. The origin list is configurable.

## Frontend

Set `VITE_API_BASE_URL` at build time — an Amplify environment variable, not a committed
file, so the same source builds for any environment:

```
VITE_API_BASE_URL=https://fo7occiuh3.execute-api.us-east-1.amazonaws.com/api/v1
```

Local development keeps its `http://localhost:4000/api/v1` default.

## Cost

Everything is serverless and scales to zero. There is no EC2, RDS, NAT gateway, load
balancer, elastic IP or VPC endpoint in the account — verified after deployment. API
Gateway HTTP APIs and Lambda are billed per request; at demo volumes this is cents a
month. Both Lambda log groups have 14-day retention.
