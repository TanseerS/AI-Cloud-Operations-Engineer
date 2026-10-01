# Hackathon submission — AI Cloud Operations Engineer

**Live application:** https://ai.tanseer.qd.je
**Repository:** https://github.com/TanseerS/AI-Cloud-Operations-Engineer
**Region:** us-east-1

---

## Short description *(one line)*

An AI cloud operations engineer that reads a live AWS account, finds real problems, reasons about
them with Amazon Bedrock, applies approved fixes to AWS, and proves the fix worked.

## Description

**The problem.** Cloud operations is three jobs nobody does together. Monitoring says a metric
crossed a line. A cost tool says the bill moved. A diagram, if it exists, is stale. None of them
tells you what is wrong, why, what it costs, and what to do — and none of them is trusted to change
anything, so a human reads three dashboards, forms a theory, and edits configuration by hand. The
gap is not detection; it is the distance between detecting something and safely acting on it.

**The solution.** AI Cloud Operations Engineer runs one operational loop against a real AWS account:
**Observe → Understand → Recommend → Approve → Remediate → Verify → Repeat.** It discovers the
architecture, reads Cost Explorer and CloudWatch, detects problems with deterministic rules, asks
Amazon Bedrock to reason about the evidence, turns a finding into a single reversible AWS change,
waits for a human to approve it, applies it, reads AWS back to prove it worked, and keeps the
environment reproducible so the loop can run again.

**What makes it different.** It is all six at once — architecture, cost, operational health, AI
reasoning, safe remediation and verification — joined into one loop, rather than six tools a human
joins by hand. And it is not a chat interface over the AWS API: the model never names a resource,
never chooses an operation, and never calls AWS. It reasons; the application acts, inside a boundary
the model cannot widen.

**Technical innovation.** The interesting problem was not getting a model to suggest a fix — it was
making an LLM-informed system safe enough to let near a real AWS account. The answer was to put the
model strictly outside the mutation path. Detection is deterministic rules over CloudWatch facts.
Bedrock reasons over those facts and nothing else, and its output is checked back against the
discovered inventory — any resource or issue it invents is rejected before display. Remediation is an
allowlist of three operations whose parameters are computed in this repository from measured evidence;
the browser can send an issue id and nothing more. One file in the codebase mutates AWS, with no
generic command dispatcher, and IAM narrows the blast radius to two Lambda functions, two log groups
and one SSM parameter — so even a total compromise of the application logic cannot reach anything else.

**AWS usage.** Amplify Hosting (frontend, custom domain, ACM), API Gateway HTTP API, Lambda (backend,
scheduler, two lab functions), Amazon Bedrock, CloudWatch metrics and logs, Cost Explorer, SSM Parameter
Store, DynamoDB, EventBridge Scheduler, Resource Groups Tagging API, IAM, Route 53 + ACM. Everything is
serverless and scales to zero — no NAT Gateway, EC2, RDS, load balancer or always-running compute anywhere.

**AI usage.** `us.amazon.nova-pro-v1:0` via the Bedrock Converse API with forced tool use, so the
response is schema-validated structure rather than prose to parse. The model was selected by
measurement: every candidate was invoked three times in the deployment region before anything was
hardcoded. It receives ~7 KB of already-collected observations, holds no credentials and no tools, and
its findings are grounding-checked against discovered AWS state before display.

**Impact.** The loop demonstrably closes. In validation it detected a Lambda provisioned 81× above its
measured memory use, explained it from CloudWatch evidence, proposed 3008 MB → 128 MB with the
arithmetic shown, applied the change on approval, and verified the result two independent ways — AWS
configuration read-back and a re-run of the detector that found the problem. Then it restored the
environment so the whole thing could be run again. The general shape — evidence-grounded reasoning,
allowlisted actions, human approval, post-change verification — is what an operations team actually
needs before it will let automation touch production.

---

## Technical highlights

**Deterministic AWS data collection.** Metrics, log samples and configuration are collected as
*facts*, each with its AWS source. Rules then run over the facts to produce *issues* that cite the
facts behind them. An unavailable metric stays unavailable; it never becomes a zero.

**Bedrock reasons, it does not execute.** The model receives only collected observations. It has no
credentials, no tools, no network. Its output is forced through a JSON schema via tool use, then
grounding-checked: findings naming an issue id or resource the application did not itself discover are
quarantined before display. The UI shows the verified-vs-rejected count.

**Allowlisted remediation actions.** Three entries — Lambda memory, Lambda timeout, log retention —
each naming exactly one AWS operation with parameters computed from measured evidence. An issue with
no entry becomes recommendation-only with the reason stated, rather than getting an invented fix.

**The caller cannot name a target.** `POST /remediation/plan` accepts issue ids and nothing else. A
body carrying `resourceArn`, `actionType` or `parameters` is rejected `400 caller_supplied_target`.
Every target, operation and parameter is re-derived from AWS by the backend.

**Approval before any infrastructure modification.** Approving constructs no AWS client and makes no
AWS call; the stored record carries `awsCallsMade: 0`. Execution is a separate capability that re-runs
every safety check against freshly read AWS state. Once approved, a plan is frozen — re-planning cannot
swap parameters underneath an approval given for different ones.

**One file mutates AWS.** `services/remediation/executors.js`: four named functions, a frozen dispatch
map, no default branch, and deliberately no `executeAwsCommand(action, params)`. The set of possible
mutations can be read off the page.

**Post-change verification.** AWS configuration is read back *and* the original detector is re-run. An
HTTP 200 from the AWS API is never treated as success on its own. Before and after states, the rollback
action, and both evidence checks are stored with the plan.

**Lab-only safety boundaries.** Seven checks must pass before anything executes: discovered this
request, name matches the lab convention, all three required tags present, correct region, action
allowlisted, parameters in range, rollback available. IAM then enforces the same boundary
independently — the role can write to exactly two functions, two log groups and one parameter.

**Idempotent reset.** The intended broken value of each seeded issue lives in SSM Parameter Store.
Reset compares each managed attribute against it and writes back only what differs, so resetting an
already-broken lab makes zero AWS calls. No user-facing cooldown; concurrent resets join one run.

**EventBridge autonomous lab management.** A scheduled Lambda calls the same reset service as the UI —
one implementation. Its role holds **no Bedrock permission at all**, so the scheduled path is
deterministic by construction rather than by intention.

**Least-privilege IAM.** Five roles, inline policies, no managed policies, no `AdministratorAccess` or
`PowerUserAccess`. Seven list actions use `Resource: "*"` because AWS provides no resource-level
permission for them; every one is read-only. Bedrock access is limited to the two configured inference
profiles and the foundation models they route to.

**Durable audit trail.** Plans live in DynamoDB rather than on a Lambda container's disk, because the
approval record and verification result *are* the audit trail — and a plan held on `/tmp` would vanish
when the container recycled, letting an applied fix show as still awaiting approval.

**Honest reporting throughout.** Usage cost and net-billed cost are reported separately because credits
make them different numbers. Billing data is never presented as live. Cost is attributed per service
with the UI stating that this is a name correspondence, not a causal claim. Partial failures degrade a
section rather than the page, and say which AWS query failed.

---

## Screenshots

| | |
|---|---|
| [Operations overview](screenshots/overview.png) | Resources, cost, issues and lab state in one view |
| [Architecture](screenshots/architecture.png) | Derived topology with findings overlaid |
| [Health & issues](screenshots/issues.png) | Deterministic findings with CloudWatch evidence |
| [AI analysis](screenshots/ai-analysis.png) | Bedrock findings with the grounding check |
| [Remediation verified](screenshots/remediation-verified.png) | Before → action → after → verified |
| [Lab control](screenshots/lab-automation.png) | Reset and autonomous schedule state |
| [Cost](screenshots/cost.png) | Usage vs net billed, trend, per-service breakdown |
| [Infrastructure](screenshots/infrastructure.png) | Live inventory by service |

## Demo

See [demo-script.md](demo-script.md) — a 3–5 minute walkthrough of the complete loop.
