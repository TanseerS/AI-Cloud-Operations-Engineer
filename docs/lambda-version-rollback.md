# Lambda version rollback

The agent could already detect a failing Lambda, explain it from CloudWatch evidence, and
say what it thought was wrong. It could not undo a bad deployment — an elevated error rate
has too many possible causes for any single configuration change to follow safely from it,
so the planner deliberately returned *recommendation only* and stopped.

This capability closes that gap for the one case where the right action **is** unambiguous:
an alias serving a version that is failing, with a known-good version still published behind
it. Rolling the pointer back is reversible, needs no build, and leaves the broken version
intact for inspection.

## What has to be true before it will act

The detection rule (`lambda-alias-serving-failing-version`) requires **two independent
signals**, and is useless with either one alone:

| Signal | Source | Why it is required |
|---|---|---|
| A measured error rate ≥ 25% over ≥ 3 invocations | CloudWatch `AWS/Lambda` Errors ÷ Invocations | Without it the rule would fire on an alias that merely points somewhere unexpected. That is drift, not an outage. |
| The alias serves a version other than the known-good one | `lambda:GetAlias` + the SSM lab baseline | Without it there is nothing safe to roll back *to*. |

A dormant lab produces no metrics, so the rule stays silent rather than guessing. That is
the same discipline every other rule follows: absent evidence is not evidence of failure.

## The safety model

Everything the existing remediation lifecycle enforces still applies — the caller cannot
name a target, the action must be allowlisted, approval makes no AWS call, and execution
re-validates against live AWS state. On top of that:

**The version is never guessed.** The known-good version is recorded in the lab baseline in
SSM, read at plan time, and re-read before execution. `safety.js` refuses `$LATEST`, any
non-numeric label, and anything that is not an explicitly published version number.

**The function and alias are fixed by server configuration.** A plan naming any other
function or alias is refused by the parameter contract even if every other check passed.

**The alias cannot be clobbered.** The `RevisionId` observed at planning time is carried
into `UpdateAlias` as an optimistic-concurrency token, and re-checked immediately before
mutation. If the alias moved between approval and execution — a reset ran, someone
deployed, another plan executed — the rollback is refused rather than reconciled. The
approval was given for a specific change; that is no longer the change that would happen.

**The agent cannot create what it rolls back to.** The backend holds no
`lambda:PublishVersion` and no `lambda:CreateFunction`. It can only select among versions a
human already published, so "roll back to version 1" can never become "deploy something
new".

## Verification: three checks, not two

Reading the alias back proves a pointer moved. It does not prove the code behind it works —
those are different claims, and only the second one is "recovered".

1. **`configuration-readback`** — `lambda:GetAlias` reports the expected version.
2. **`detector-rerun`** — the rule that found the problem no longer fires.
3. **`behaviour-probe`** — the alias is invoked with a fixed, read-only payload and must
   return `statusCode 200`, `ok: true`, and the release name the baseline records.

The probe is the only one of the three that observes behaviour. It is why the system can
say *recovered* rather than *changed*. A correct alias with a still-failing probe reports
`verification_failed` — a real and useful outcome, reported honestly rather than rounded up.

The probe only runs for plans that carry a probe contract, so the two existing checks are
unchanged for every action that had none.

## The lab resource

`aicoe-lab-rollback-function` exists only to demonstrate this. Its two versions are a
realistic regression rather than a crash for its own sake:

- **version 1** (`v1-known-good`) computes basket totals correctly.
- **version 2** (`v2-regressed`) is a refactor that drops quantity from the calculation,
  fails its own invariant, and raises. Raising is deliberate: an `Unhandled` FunctionError
  is what increments the CloudWatch Errors metric. A handler returning a 500 body would
  look healthy to CloudWatch and the rule would never fire.

Alias `live` is seeded pointing at version 2. Published versions are immutable, so version 1
cannot stop being the version that was validated.

A dedicated function rather than reusing an existing lab function: the other two already
carry a baseline keyed on a configuration attribute, and adding a version axis to them
would make their reset ambiguous.

Setup is one script, run once by a human:

```bash
bash infrastructure/lab/rollback-function/setup.sh
```

## Reset

Reset restores alias `live` to version 2 through the same allowlisted action, the same
safety gate and the same executors as every other managed attribute. It is idempotent:
an alias already at version 2 produces no AWS call, which the unchanged `RevisionId`
proves rather than merely reports.

One distinction the gate has to draw: a **remediation** must carry the `RevisionId`
observed at planning time, because a human approved one specific change and the alias
must not have moved since. A **reset** has no such gap — it is server-initiated, holds an
exclusive in-flight lock, and writes a constant from the baseline — so it supplies no
token and the gate does not demand one. Requiring it made reset skip the alias silently
and then report success, which live validation caught. Every other check still applies to
a reset identically: function, alias, published version, tags, region.

### A reset-verification bug this work also fixed

Reset used to require three rules to fire again afterwards. One of them,
`lambda-memory-over-provisioned`, reads peak memory from the function's own `REPORT` lines —
which only exist after an invocation. Reset restores configuration; it does not generate
traffic. So an idle lab was correctly restored and then reported its own success as a
failure.

Verification now distinguishes *failed* from *inconclusive*, and draws the line from the
facts themselves rather than a hardcoded list: if the fact a rule depends on came back
unavailable, the check is inconclusive and does not fail the reset. If the fact **is**
available and the rule still does not fire, that remains a genuine failure. Both directions
are pinned by regression tests.

## IAM

| Role | Added | Scope |
|---|---|---|
| `aicoe-backend-role` | `lambda:GetAlias`, `lambda:ListVersionsByFunction`, `lambda:UpdateAlias` | the rollback function (see below) |
| | `lambda:InvokeFunction` | **the `live` alias ARN only** — the project's only invoke permission |
| `aicoe-lab-automation-role` | `lambda:GetAlias`, `lambda:UpdateAlias` | the rollback function (see below) |

Neither role gains `PublishVersion`, `DeleteAlias`, `DeleteFunction`, `UpdateFunctionCode`
or any wildcard. The scheduler role gains no invoke permission and still holds no Bedrock
permission at all. All of that is asserted by IAM policy simulation, not by reading.

### Why the alias actions are scoped to the function, not the alias

The intent was to scope `UpdateAlias` to a single alias ARN, and the first version of this
policy did exactly that. It does not work: **`lambda:UpdateAlias` and `lambda:GetAlias`
authorize against the unqualified *function* ARN**, which live validation surfaced as

```
not authorized to perform: lambda:UpdateAlias on resource:
arn:aws:lambda:us-east-1:...:function:aicoe-lab-rollback-function
```

Note the absence of `:live`. The IAM policy simulator reported *allowed* for the alias ARN,
because that is a different question from the one Lambda actually asks. AWS exposes no
condition key to narrow these actions to one alias.

So the IAM boundary is the function, and the single-alias restriction is enforced one layer
up, by the backend's parameter contract, which refuses any alias but `live` and is covered
by tests. This function has exactly one alias, so the practical blast radius is unchanged —
but the boundary is documented as it actually is rather than as it was intended.

`lambda:InvokeFunction` **does** honour an alias-qualified ARN, so the probe permission is
genuinely restricted to `:live`.

### Applying an IAM change to a running Lambda

A warm Lambda execution environment caches its role credentials, so a policy change is not
picked up by an already-running container. After changing either policy, either wait for the
environment to recycle or force it:

```bash
aws lambda update-function-configuration --function-name <fn> --environment "Variables={...}"
```

Both live failures during validation were this, not a policy error.

## Where Bedrock sits

Exactly where it already sat. The model reasons over the collected evidence and its
reasoning is attached to the plan as advisory context. It does not choose the action, name
the target, pick the version, or call AWS. The rollback is computed by the registry from the
baseline, and the model's output cannot reach any of it.
