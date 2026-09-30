# AI analysis (Amazon Bedrock)

`POST /api/v1/ai/analyze` · `GET /api/v1/ai/status`

## Model selection was measured, not assumed

Model access in Bedrock is per account, per model and per region, and listing a model is
not the same as being able to invoke it. Every candidate was invoked for real before
anything was built. Three attempts each, us-east-1, 2026-09-30:

| Model | Result |
|---|---|
| `us.amazon.nova-pro-v1:0` | **3/3 succeeded** — selected |
| `us.amazon.nova-lite-v1:0` | 3/3 succeeded — first fallback |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | 0/3 — `INVALID_PAYMENT_INSTRUMENT` |
| `us.anthropic.claude-sonnet-4-6` | 0/3 — `INVALID_PAYMENT_INSTRUMENT` |
| `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | 0/3 — `INVALID_PAYMENT_INSTRUMENT` |

Every Anthropic model is blocked by an AWS Marketplace subscription this account cannot
complete — not by a missing IAM permission, and not by the request. Claude Haiku and
Sonnet 4.6 both answered successfully early in the session and then stopped, so the
failure is intermittent at the account level rather than a property of the model.

Two further facts from the inspection:

- **No Anthropic model supports direct on-demand invocation in us-east-1.** They are
  reachable only through an inference profile, which is why every id carries a `us.`
  prefix. Calling the bare model id fails.
- Nova Pro honours **forced tool use**, which is what the structured output depends on.

Nova Pro is therefore the most capable model this account can *reliably* invoke.
`BEDROCK_MODEL_ID` switches it in one line; no model id appears anywhere else in the
codebase.

## Structured output

The schema is sent as a forced tool definition (`toolChoice: {tool: …}`) rather than
requested in prose, so the model returns a parsed object and there is nothing to strip.
The same schema validates the response, so the model cannot be asked for one shape and
checked against another. A model that answers in prose anyway is handled by salvaging
JSON from the text — the fallback, not the design.

`maxTokens` is always set explicitly. Leaving it unset reserves the model's maximum
against the account's throughput quota and causes throttling that looks unrelated.

## Two guards between the model and the UI

**Validation** — the response must match the schema the UI renders. A failure returns
`ok: false` with the exact failing paths, never partial or malformed output.

**Grounding** — every `issueId` the model returns must match an issue a deterministic
rule actually detected, and every resource it names must exist in the discovered
inventory. Anything else is quarantined in `rejectedFindings` and never shown as real.
This is what stops the model inventing an RDS connection-pool problem in an account with
no RDS.

The model is a reasoning layer over measured data. It is not a source of facts, and the
API's shape enforces that.

## What the model is given

The backend builds the context; the browser sends no AWS data and cannot influence it.
About 8.6 KB for this lab:

- **Architecture** — resources with the configuration relevant to each service, and the
  relationships with the AWS field each was derived from
- **Cost** — usage vs net billed, credits, the period comparison, and the top services
  with their `discoveryService` correlation key
- **Health** — every detected issue with its measurements and evidence, plus the metrics
  that were *unavailable* so the model knows what was not measured
- **Log evidence** — the redacted, truncated sample lines, three per issue

The system prompt requires the model to separate FACT (present in the observations),
INFERENCE (derived from them) and RECOMMENDATION (an action), to quote real values, and
to put anything unsupported into `insufficientEvidence` rather than guessing.

## Cost safety

- **POST only.** A render, a prefetch or a crawler cannot trigger an invocation. `GET`
  on the analyze path returns 404.
- The page invokes nothing on mount — verified in the browser: **0 POSTs on load, 1 per
  explicit click**.
- Results cache for 10 minutes; repeated requests return the cached analysis.
- A minimum interval between live invocations means a held-down button cannot meter the
  account.
- `GET /ai/status` is free — it reads configuration and last-known state, making no
  Bedrock call, so the model indicator costs nothing to display.

## Frontend

The findings are joined back to the deterministic issues they explain, so the reader can
follow one chain: **architecture node → detected issue → evidence → AI root cause →
recommendation**. Each finding links to the resource in the architecture view and to the
issue it came from. Nothing is rendered as a wall of model prose.

The model status strip shows reachability, the active model and the region — and says so
when a fallback was used. It exposes no account identifier or credential.
