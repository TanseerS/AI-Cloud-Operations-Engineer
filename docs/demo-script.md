# Demo script

**3–5 minutes.** One continuous loop against a live AWS account — not a tour of AWS services.

**URL:** https://ai.tanseer.qd.je

## Before you start

Open the Lab control page and confirm it reads **Intentionally broken · matches baseline**. If it
does not, press **Reset lab** and wait a few seconds. That is the only setup.

Nothing else needs priming. Every number in the demo is read from AWS at the moment you load the page.

---

## The line to open with

> "This is a real AWS account with real problems in it. Watch the system find one, explain it, fix
> it, and prove the fix worked."

---

### 1 · Overview — "I have an AWS environment" *(20s)*

Land on the dashboard.

- **14 AWS resources** across 5 services, discovered live.
- **6 active issues**, 3 critical or high.
- **Lab state: intentionally broken.**

> "Everything on this page was read from AWS when the page loaded. The browser holds no AWS
> credentials — it talks to our API, and the API talks to AWS."

Point at the footer line that says exactly that.

### 2 · Architecture — "The system understands its architecture" *(30s)*

Click **Architecture**.

- The topology is derived, not drawn: API Gateway → Lambda → log group → IAM role.
- Findings are overlaid on the nodes — the red badges are the detected problems.

> "Every line here comes from a field in a resource's own AWS configuration. If we can't trace an
> edge back to real configuration, we don't draw it."

Click a node to show the detail panel.

### 3 · Cost and health — "It understands cost and operational health" *(40s)*

Click **Costs**.

- Usage cost and **actually billed** are shown separately — credits make them different numbers.
- Daily trend and per-service breakdown from Cost Explorer.

> "It never claims this is a live bill. AWS finalises charges over about a day, and the page says so."

Click **Health & issues**.

- Findings with severity, the affected resource, and the CloudWatch evidence behind each one.

> "These are deterministic rules over CloudWatch metrics and log events. No model has been involved
> yet — this is measurement."

### 4 · Pick the issue — "It detects a real problem" *(20s)*

Open **Lambda `aicoe-lab-function` is provisioned 81.3× above its measured memory use**.

Show the evidence: configured 3008 MB, peak observed use ~37 MB, read from the function's own
CloudWatch `REPORT` lines.

### 5 · AI analysis — "Amazon Bedrock analyzes the evidence" *(50s)*

Click **AI analysis** → **Run analysis**. It takes about 10 seconds.

While it runs:

> "The model gets only what we already collected — about 7 KB of architecture, cost and CloudWatch
> observations. It has no AWS credentials, no tools, and no ability to call anything."

When results appear, point at the **grounding panel**:

- `6 of 6 findings verified`
- Model, region, latency, token counts.

> "Every resource and issue the model named was checked against what we actually discovered. Anything
> it invented would have been rejected before it reached this screen. That check is why this is usable
> rather than plausible."

Show the split: **Cost opportunities** vs **Reliability**, and the **Insufficient evidence** panel —
what the model declined to conclude.

### 6 · Remediation plan — "The system proposes a safe fix" *(30s)*

Click **Remediation** → **Build plans**.

- Three executable plans; three marked **recommendation only** with the reason stated.
- Open the memory plan: **CURRENT 3008 → PROPOSED 128**, low risk, reversible, with the arithmetic shown.

> "The browser cannot name a resource or an action. It sends an issue id; the backend re-derives
> everything else from AWS. And notice what *isn't* automated — an elevated error rate has too many
> possible causes for any single config change to be safe, so the system says so instead of guessing."

Point at the guardrail strip: targets restricted to three required tags in one region.

### 7 · Approve — "I approve the fix" *(15s)*

Click **Approve fix**.

> "That changed nothing in AWS. Approval is a state change — zero AWS calls. The record even says so."

### 8 · Execute — "The system changes AWS" *(30s)*

Click **Execute**.

> "This is the only code in the project that mutates AWS: one file, four named functions, no generic
> command dispatcher. There is no code path that could run an operation that isn't on the list."

### 9 · Verify — "It verifies the result" *(30s)*

The card becomes **Verified — issue resolved**:

- **BEFORE** 3008 → **ACTION** `lambda:UpdateFunctionConfiguration` → **AFTER** 128 → **VERIFIED**
- Two evidence lines: *configuration-readback* (AWS reports the new value) and *detector-rerun*
  (the rule that found the problem no longer fires).

> "A 200 from the AWS API is not proof. We read the resource back and re-run the detector that found
> the problem in the first place."

### 10 · Reset — "The lab returns to a reproducible state" *(25s)*

Click **Lab control** → **Reset lab**.

- Memory goes back to 3008. The issue returns. Count is 6 again.

> "The baseline for every seeded issue lives in SSM Parameter Store. Reset compares against it and
> writes back only what differs — so resetting an already-correct lab makes no AWS calls at all."

### 11 · Autonomous — close the loop *(20s)*

Stay on Lab control and point at the automation panel.

- EventBridge Scheduler, every 6 hours, with the last run's result and what it changed.

> "The same reset service runs on a schedule. Its IAM role holds no Bedrock permission at all, so the
> autonomous path is deterministic by construction — and it can write to exactly two Lambda functions
> and two log groups. Nothing else in the account is reachable."

---

## The line to close with

> "Architecture, cost, health, AI reasoning, a safe fix, and proof it worked — one loop, running
> against a real AWS account, with a human approving the one step that changes anything."

---

## If something goes wrong

| Symptom | What to do |
|---|---|
| First page load is slow | Lambda cold start, 2–3 seconds. Load the site once before you present. |
| Remediation page is empty | Press **Build plans** — plans are built on demand, not on page load. |
| A plan already says *verified* | Press **Reset lab**, then **Re-plan**. |
| AI analysis is slow | Expect ~10 s. It is cached for 10 minutes, so a second run is instant. |
| Cost shows $0.00 month-to-date | Correct early in a month. The trailing-30-day panel below it has real data. |

## Things worth saying if asked

- **"Could the AI delete something?"** No. It cannot name a resource or an operation. The set of
  possible mutations is three entries in a file, and IAM scopes writes to two functions and two log groups.
- **"Is this mocked?"** No. Every figure comes from Lambda, CloudWatch, Cost Explorer, API Gateway,
  SSM and the Tagging API at request time. Reset genuinely reconfigures AWS.
- **"Why Nova and not Claude?"** Measured, not chosen: every candidate was invoked three times in-region
  first. Anthropic models fail in this account on a Marketplace billing issue; Nova Pro succeeded 3/3.
