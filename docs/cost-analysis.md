# Cost analysis

`GET /api/v1/costs`

Account-wide AWS spend from **Cost Explorer** (`GetCostAndUsage`, `UnblendedCost`).
Cost Explorer is a global service reached through `us-east-1` regardless of where the
workload runs, because billing is account-wide rather than regional.

## Two totals, on purpose

In an account with credits these are not the same number, and reporting only one is
misleading in a different way each time:

| Figure | Means | This account, September 2026 |
|---|---|---|
| `totals.usageCost` | What the running resources cost at list rate | $1.4358 |
| `totals.netCost` | What is actually billed after credits, discounts and tax | ≈$0.00 |

The optimisation question - "is the over-provisioned function expensive?" - is about
usage. The finance question - "what will I pay?" - is about net. The dashboard shows
both side by side, with the record-type split (Usage / Credit / Bundled Discount / Tax)
underneath so the gap is explained rather than hidden.

Per-service costs and the daily trend are filtered to `RECORD_TYPE = Usage`. Without
that filter every service reads $0.00, because the credit line nets each one out.

## Billing data is never presented as live

`dataStatus.realTime` is always `false`. AWS finalises charges over roughly 24 hours, so
the most recent day is usually incomplete - the UI states this, names the last day that
carried charges, and reports how many days AWS flagged `Estimated`.

## Period comparison

The previous window is the **same number of elapsed days** of the previous month, not the
whole month. Comparing 30 elapsed days against a full 31-day month would manufacture a
saving. If the previous month is shorter than the elapsed days of this one, the windows
are not comparable and no percentage is shown.

## Cost of the cost API

Every `GetCostAndUsage` request is billed at **$0.01**. One uncached refresh makes three
requests, so responses are cached for 15 minutes and `?refresh=true` is opt-in. The
response reports how many requests it used and what they cost - which is why *AWS Cost
Explorer* appears in this account's own top cost drivers.

## Correlation seam

`backend/src/services/cost/service-mapping.js` maps Cost Explorer's billing service names
onto discovery's service keys, so each service cost entry carries `discoveryService`:

```
AWS Lambda        -> lambda
AmazonCloudWatch  -> logs
Amazon API Gateway-> apigateway
```

That is the join for the work that comes later:

```
AWS service -> discovered resources -> cost -> metrics -> issues
```

Cost Explorer's names are inconsistent (`AWS Lambda`, `AmazonCloudWatch`,
`Amazon API Gateway`), so the mapping is explicit rather than derived from string
munging. An unmapped service still reports its cost; it simply has nothing to join to
yet, which is honest about what the application can currently correlate. The UI marks
mappable services with a `LINKED` badge.

## Charts

Hand-rolled inline SVG and CSS bars rather than a chart library - no dependency, and
every colour, radius and duration resolves to an existing design token.

- **Daily trend**: one series, so no legend; the card title names it. 2px line over a
  low-opacity fill, three recessive gridlines, one direct label on the peak rather than a
  number on every point, and a crosshair plus tooltip on hover. A visually-hidden table
  carries the same numbers for screen readers.
- **Service breakdown**: horizontal bars sorted descending. Twelve services with a
  70/18/11 split and a long tail of fractions of a cent would be unreadable as donut
  angles, and the names need a left-aligned label anyway. One measure, one hue - the bars
  encode magnitude, not identity, so a categorical palette would imply a distinction that
  does not exist.
- **Chart marks are their own tokens.** The app accent sits outside the validated
  lightness band against a dark chart surface, so dark mode uses a deeper step
  (`#6390f2`). Both were checked with the palette validator: inside the band, above the
  chroma floor, and at least 3:1 against their surface.
- Direction is never colour alone - increases and decreases carry an arrow and a signed
  percentage as well.

## Formatting

Values span four orders of magnitude - a $1.44 total beside a $0.0002 service. A fixed
2dp would render most of this account as "$0.00", which reads as *free* rather than
*small*, so small values switch to 4-6 decimal places and a figure that rounds to zero
shows `≈$0.00` rather than `<$0.01`.

## States

| State | Trigger | Shown |
|---|---|---|
| Loading | request in flight | Skeleton headline, tiles and charts |
| Normal | data returned | Headline, drivers, trend, breakdown, billing status |
| No billing data | `available: false` | Empty state naming the AWS error, with retry |
| Zero spend | data returned, every charge zero | Info callout instead of empty charts |
| Partial | one or more of the three queries failed | Warning callout; the rest still renders |
| Error | API unreachable | Error card with retry |
