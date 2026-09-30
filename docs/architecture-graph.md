# Architecture graph

`GET /api/v1/architecture/graph`

Derives the topology from the same live discovery inventory the Infrastructure page uses,
so the two views can never disagree about what exists.

## The relationship model

`backend/src/services/architecture/relationships.js` holds every rule that can produce an
edge. A line between two boxes is a claim about production topology, and a wrong claim is
worse than no line, so each rule names the exact AWS field it read and an edge is only
emitted when **the target is itself present in the discovered inventory**.

| Rule | Edge | Read from |
|---|---|---|
| `apigateway-invokes-lambda` | API Gateway → Lambda | `apigatewayv2:GetIntegrations` `IntegrationUri` (AWS_PROXY only) |
| `lambda-writes-logs` | Lambda → Log group | `lambda:GetFunctionConfiguration` `LoggingConfig.LogGroup` |
| `lambda-assumes-role` | Lambda → IAM role | `lambda:GetFunctionConfiguration` `Role` |

Nothing is inferred from a shared name, prefix or tag.

### Confidence

`declared` - an explicit field in the resource's own configuration.
`default` - a documented AWS behaviour that holds when nothing overrides it, such as the
`/aws/lambda/<name>` log group a function uses when it declares no `LoggingConfig`. These
edges are drawn **dashed**, so the diagram never overstates what it knows.

### Adding a service

Add a rule object with `from`, `to`, `kind`, `label` and `resolve(resource, lookup)`. The
graph builder, the layout and the frontend need no changes; `lookup.byArn` and
`lookup.byName` cover identity matching. The builder is service-agnostic - it indexes
whatever discovery returned and runs whatever rules apply, so RDS, S3, CloudFront, EC2 and
VPC arrive the same way.

## What the response contains

```
generatedAt, region
discovery { discoveredAt, durationMs, partial, summary, services[], errors[] }
nodes     [ { id, kind: 'resource'|'group', service, type, name, region, arn, status, tags, attributes } ]
edges     [ { id, source, target, kind, label, confidence, evidence, detail } ]
summary   { totalResources, servicesDetected, byService, healthyResources,
            resourcesRequiringAttention, attentionResources[], connectedResources,
            unconnectedResources, relationshipCount, groupedNodes }
relationshipRules [ { id, from, to, candidateSources, edgesFound, description } ]
```

`relationshipRules` reports what each rule found, including zero. "No edges" and "we never
looked" are different answers, and the response distinguishes them.

### Grouping

Resources with no edge in either direction are collapsed into one labelled group node per
service once there are three or more of them, so a long tail of standalone resources does
not bury the topology. Nothing is hidden - the group node carries every member, and the
detail panel lists them.

## Frontend

React Flow renders the nodes and edges; dagre ranks them, so the topology decides the
columns rather than any hardcoded idea of which service belongs where. The route is
lazy-loaded, keeping the graph library out of the initial bundle.

- Left-to-right on desktop, top-to-bottom below 900px.
- Zoom and pan by wheel, drag and on-canvas controls, with fit-to-view.
- Clicking a node opens a glass detail panel over the canvas - a bottom sheet on narrow
  screens - showing that resource's real discovered configuration, its relationships with
  the evidence behind each one, and its tags. Escape closes it.
- Colour is carried by a single status dot per node, so a healthy graph reads as neutral
  rather than as a wall of green.

## States

| State | Trigger | Shown |
|---|---|---|
| Loading | request in flight | Skeleton tiles and canvas |
| Normal | nodes and edges present | Summary tiles, graph, legend |
| No relationships | nodes present, zero edges | Info callout plus the nodes as they are - never an empty canvas |
| Partial | one or more services failed | Warning callout naming them, graph built from the rest |
| Total failure | every service failed | Danger callout with retry |
| Discovery error | API unreachable | Error card with retry |
