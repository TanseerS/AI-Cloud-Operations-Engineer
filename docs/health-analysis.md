# Health and issue detection

`GET /api/v1/health/analysis` · `GET /api/v1/health/issues/:id`

(`GET /api/v1/health` stays the process liveness probe — it makes no AWS calls, so it
still answers when the account is unreachable, which is when you most need it to.)

## Facts and issues are different things

The response keeps them apart on purpose:

- **fact** — something AWS reported. It carries the API it came from and the window it
  covers, and it is true whether or not anyone thinks it is a problem.
- **issue** — an inference a rule drew from one or more facts. It cites them by id.

A metric CloudWatch could not return is recorded as `available: false` with a note, never
as a zero. "We measured zero errors" and "we could not measure" are different claims, and
only one of them is evidence of health.

**No model is involved.** The rules are pure functions of the facts, so the same
observations always produce the same findings. `meta.aiAssisted` is `false`.

## Metrics collected

One `GetMetricData` call covers every discovered resource — one request regardless of
inventory size, and a per-query status so an absent metric is distinguishable from a zero.

| Scope | Metrics |
|---|---|
| Lambda (`AWS/Lambda`, dimension `FunctionName`) | Invocations, Errors, Throttles, Duration (avg + max), ConcurrentExecutions |
| API Gateway (`AWS/ApiGateway`, dimension `ApiId`) | Count, 5xx, 4xx, Latency (avg + max), IntegrationLatency |

Error percentage is derived, not fetched — CloudWatch has no such metric.

## Logs sampled

Bounded on both axes: a fixed window and **40 events maximum per query per log group**.
Log ingestion is billed, and a health check that scans a busy log group would cost more
than the problem it found. Two cheap passes per group:

- **errors** — `?ERROR ?Exception ?Traceback ?"Task timed out"`, the evidence for a
  reliability finding
- **reports** — Lambda `REPORT` lines, parsed for `Max Memory Used` and billed duration

Every sampled line is **redacted before it leaves the backend** — AWS key ids, bearer
tokens, `password`/`secret`/`token`-shaped assignments and long opaque blobs are replaced,
and each line is truncated to 400 characters. At most six lines per log group reach the
response.

## Detection rules

| Rule | Fires when | Severity |
|---|---|---|
| `lambda-error-rate` | invocations > 0 and errors > 0 | by error rate: ≥50% critical, ≥10% high, else medium |
| `api-5xx-errors` | requests > 0 and 5XX > 0 | same scale |
| `lambda-memory-over-provisioned` | measured peak memory < 40% of configured, and configured > 256 MB | medium below 10% utilisation, else low |
| `log-retention-excessive` | retention > 400 days, or no retention policy at all | low |
| `log-errors-present` | error-pattern matches in the window | high at ≥10 events, else medium |
| `lambda-timeout-exceeds-caller` | function timeout > its caller's integration timeout | medium |

Two constraints every rule honours: it emits nothing when the evidence is absent, and
everything it asserts is backed by a fact it cites. The memory rule will not fire on
configuration alone — a large memory setting is a choice until utilisation is measured
from the function's own REPORT lines.

## Health score

Penalties are capped per severity class (critical 26 each to 60, high 14 to 24, medium 6
to 12, low 2 to 6). Without caps a handful of criticals pins the score at zero and every
further finding becomes invisible — the number stops carrying information exactly when
there is most to say.

## Architecture integration

`resourceHealth` rolls findings up per resource, and the architecture graph consumes it:
each node shows its finding count and its dot takes the colour of its worst severity. An
Active function with a 100% error rate is not drawn as healthy, whatever its Lambda State
says. "Show in architecture" on a finding opens
`/architecture?focus=<resourceId>`, which selects that node and opens its detail panel.

## States

| State | Trigger | Shown |
|---|---|---|
| Loading | request in flight | Skeleton banner, tiles, list |
| Issues found | rules matched | Score, severity tiles, expandable findings |
| No findings | rules ran, nothing matched | Empty state naming how many observations were collected — a result, not an absence |
| Partial CloudWatch data | a collection stage failed | Danger callout naming the stage; config- and log-based findings still render |
| Insufficient metric data | metrics returned no datapoints | Warning callout listing each metric as unavailable rather than zero |
| API failure | backend unreachable | Error card with retry |
