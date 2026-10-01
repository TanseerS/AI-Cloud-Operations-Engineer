import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import StatTile from '../components/ui/StatTile.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Callout from '../components/ui/Callout.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusIndicator from '../components/ui/StatusIndicator.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import ArchitectureGraph from '../components/architecture/ArchitectureGraph.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { useRefresh } from '../context/RefreshContext.jsx';
import { api } from '../lib/api.js';
import { formatDuration, formatRelative } from '../lib/format.js';

export function ArchitecturePage() {
  const { refreshToken } = useRefresh();
  const architecture = useApiResource(api.architecture, { refreshToken });
  // Findings are loaded alongside the topology so a node can carry its own health.
  // A failure here degrades the overlay only - the graph still renders.
  const health = useApiResource(api.healthAnalysis, { refreshToken });
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const { data, status, error, reload } = architecture;

  const isBusy = status === 'loading' || status === 'refreshing';
  const summary = data?.summary;
  const discovery = data?.discovery;

  const failedServices = (discovery?.services ?? []).filter((entry) => entry.status === 'failed');
  const everythingFailed =
    discovery && discovery.summary?.servicesFailed === discovery.summary?.servicesQueried;

  const serviceLabels = Object.fromEntries(
    (discovery?.services ?? []).map((entry) => [entry.service, entry.label]),
  );

  const hasNodes = (data?.nodes?.length ?? 0) > 0;
  const hasEdges = (data?.edges?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        eyebrow="Topology"
        title="Architecture"
        subtitle="How the discovered AWS resources actually connect. Every line is derived from a field in the resources' own AWS configuration - nothing is inferred from naming."
        aside={
          <>
            {data ? (
              <StatusIndicator
                tone={everythingFailed ? 'danger' : discovery.partial ? 'warning' : 'success'}
                label={
                  everythingFailed
                    ? 'Discovery failed'
                    : discovery.partial
                      ? 'Partial topology'
                      : `${summary.relationshipCount} relationships`
                }
                pulse={isBusy}
              />
            ) : null}
            <Button onClick={reload} disabled={isBusy}>
              <Icon name="refresh" size={14} />
              {isBusy ? 'Mapping' : 'Remap'}
            </Button>
          </>
        }
      />

      {status === 'loading' ? (
        <>
          <div className="stat-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonCard key={index} rows={2} />
            ))}
          </div>
          <SkeletonCard rows={8} />
        </>
      ) : null}

      {status === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not build the architecture map">
              {error?.message}. The backend must be running and able to reach AWS.
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={reload}>
                <Icon name="refresh" size={14} />
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {data ? (
        <>
          {everythingFailed ? (
            <Callout
              tone="danger"
              title="No topology could be built: every AWS service call failed"
              actions={
                <Button onClick={reload} disabled={isBusy}>
                  Retry
                </Button>
              }
            >
              {failedServices[0]?.error?.message}
            </Callout>
          ) : failedServices.length > 0 ? (
            <Callout
              tone="warning"
              title={`Partial topology: ${failedServices.length} of ${discovery.summary.servicesQueried} services could not be queried`}
              actions={
                <Button onClick={reload} disabled={isBusy}>
                  Retry
                </Button>
              }
            >
              {failedServices.map((entry) => (
                <p key={entry.service}>
                  <strong>{entry.label}</strong>: {entry.error?.message}
                </p>
              ))}
              Resources from those services are missing from the map, and so is any
              relationship that would have touched them.
            </Callout>
          ) : null}

          <div className="stat-grid">
            <StatTile
              label="Total resources"
              icon="overview"
              value={summary.totalResources}
              hint={`${summary.connectedResources} connected, ${summary.unconnectedResources} standalone`}
            />
            <StatTile
              label="Services detected"
              icon="cloud"
              value={summary.servicesDetected}
              hint={Object.keys(summary.byService).join(', ')}
            />
            <StatTile
              label="Healthy"
              icon="activity"
              value={summary.healthyResources}
              hint="Reported healthy by AWS"
            />
            <StatTile
              label="Need attention"
              icon="issues"
              value={summary.resourcesRequiringAttention}
              hint={
                summary.resourcesRequiringAttention === 0
                  ? 'AWS reports no resource in a failed state. Detected findings are overlaid on the map below.'
                  : summary.attentionResources.map((entry) => entry.name).join(', ')
              }
            />
          </div>

          <section className="section">
            <div className="section__header">
              <h2 className="section__title">Topology</h2>
              <p className="section__hint">
                {data.region} · built in {formatDuration(discovery.durationMs)} ·{' '}
                {formatRelative(data.generatedAt)}
              </p>
            </div>

            {!hasNodes ? (
              <Card>
                <CardBody>
                  <EmptyState icon="cloud" title="No resources to map">
                    Discovery found nothing in {data.region} matching the lab filter, so there is
                    no topology to draw.
                  </EmptyState>
                </CardBody>
              </Card>
            ) : (
              <>
                {!hasEdges ? (
                  <Callout tone="info" title="No relationships could be established">
                    The resources below were discovered, but none of their AWS configuration
                    referenced another discovered resource. They are shown as they are rather
                    than joined by a line that would not be true.
                  </Callout>
                ) : null}

                <Card className="arch-card">
                  <ArchitectureGraph
                    graph={data}
                    serviceLabels={serviceLabels}
                    resourceHealth={health.data?.resourceHealth ?? []}
                    issues={health.data?.issues ?? []}
                    focusId={focusId}
                  />
                </Card>

                <div className="arch-legend">
                  <span className="arch-legend__group">
                    <span className="arch-legend__swatch arch-legend__swatch--success" /> Healthy
                    <span className="arch-legend__swatch arch-legend__swatch--warning" /> Attention
                    <span className="arch-legend__swatch arch-legend__swatch--danger" /> Failing
                  </span>
                  <span className="arch-legend__group">
                    {data.relationshipRules
                      .filter((rule) => rule.edgesFound > 0)
                      .map((rule) => (
                        <Badge key={rule.id} tone="outline">
                          {rule.from} → {rule.to}: {rule.edgesFound}
                        </Badge>
                      ))}
                  </span>
                  <span className="arch-legend__group">
                    {health.data ? (
                      <Badge tone={health.data.summary.totalIssues > 0 ? 'warning' : 'success'}>
                        {health.data.summary.totalIssues} findings overlaid
                      </Badge>
                    ) : health.status === 'error' ? (
                      <Badge tone="outline">health overlay unavailable</Badge>
                    ) : null}
                  </span>
                  <span className="arch-legend__hint">
                    Click a node for details. Dashed lines rest on an AWS default rather than an
                    explicit setting. A node's dot reflects its worst finding.
                  </span>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

export default ArchitecturePage;
