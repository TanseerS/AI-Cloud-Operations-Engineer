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
import ServiceSection from '../components/infrastructure/ServiceSection.jsx';
import { presentationFor } from '../components/infrastructure/presentation.js';
import useApiResource from '../hooks/useApiResource.js';
import { useRefresh } from '../context/RefreshContext.jsx';
import { api } from '../lib/api.js';
import { formatDuration, formatRelative } from '../lib/format.js';

function LoadingState() {
  return (
    <>
      <div className="stat-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} rows={2} />
        ))}
      </div>
      <div className="section">
        <SkeletonCard rows={4} />
      </div>
    </>
  );
}

export function InfrastructurePage() {
  const { refreshToken } = useRefresh();
  const inventory = useApiResource(api.infrastructure, { refreshToken });
  const { data, status, error, reload } = inventory;

  const isBusy = status === 'loading' || status === 'refreshing';
  const services = data?.services ?? [];
  const summary = data?.summary;

  // Everything failed: treat it as an outage rather than an empty account.
  const totalFailure =
    data && summary?.servicesFailed === summary?.servicesQueried && summary?.servicesQueried > 0;

  const failedServices = services.filter((entry) => entry.status === 'failed');
  const warnings = (data?.errors ?? []).filter((entry) => entry.level === 'warning');

  const aside = (
    <>
      {data ? (
        <StatusIndicator
          tone={totalFailure ? 'danger' : data.partial ? 'warning' : 'success'}
          label={
            totalFailure ? 'Discovery failed' : data.partial ? 'Partial discovery' : 'Discovery complete'
          }
          pulse={isBusy}
        />
      ) : null}
      <Button onClick={reload} disabled={isBusy}>
        <Icon name="refresh" size={14} />
        {isBusy ? 'Scanning' : 'Rescan'}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Infrastructure"
        subtitle="Live inventory of the AWS resources belonging to this lab, read through the backend. The browser never holds AWS access."
        aside={aside}
      />

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not reach the discovery API">
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
          {totalFailure ? (
            <Callout
              tone="danger"
              title="Discovery reached AWS but every service call failed"
              actions={
                <Button onClick={reload} disabled={isBusy}>
                  Retry
                </Button>
              }
            >
              {failedServices[0]?.error?.message}
            </Callout>
          ) : null}

          {!totalFailure && failedServices.length > 0 ? (
            <Callout
              tone="warning"
              title={`Partial discovery: ${failedServices.length} of ${summary.servicesQueried} services could not be queried`}
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
              Everything below comes from the services that answered.
            </Callout>
          ) : null}

          {!totalFailure && warnings.length > 0 ? (
            <Callout tone="warning" title="Discovery completed with warnings">
              {warnings.map((entry, index) => (
                <p key={index}>
                  <strong>{entry.label}</strong>: {entry.message}
                </p>
              ))}
            </Callout>
          ) : null}

          <div className="stat-grid">
            <StatTile
              label="Total resources"
              icon="overview"
              value={summary.totalResources}
              hint={`${summary.servicesSucceeded} of ${summary.servicesQueried} services answered`}
            />
            {services
              .filter((entry) => entry.status !== 'failed')
              .map((entry) => (
                <StatTile
                  key={entry.service}
                  label={presentationFor(entry.service).shortLabel}
                  icon={presentationFor(entry.service).icon}
                  value={entry.resourceCount}
                  hint={entry.label}
                />
              ))}
          </div>

          <section className="section">
            <div className="section__header">
              <h2 className="section__title">Discovered resources</h2>
              <p className="section__hint">
                {data.region} · scanned in {formatDuration(data.durationMs)} ·{' '}
                {formatRelative(data.discoveredAt)}
              </p>
            </div>

            <div className="discovery-meta">
              <Badge tone="outline">
                Filter: {data.filter.tagKey}={data.filter.tagValue}
              </Badge>
              <Badge tone="outline">Prefix: {data.filter.namingPrefix}</Badge>
              <Badge tone={data.filter.tagIndexAvailable ? 'success' : 'warning'}>
                Tag index {data.filter.tagIndexAvailable ? 'available' : 'unavailable'}
              </Badge>
            </div>

            {summary.totalResources === 0 && !totalFailure ? (
              <Card>
                <CardBody>
                  <EmptyState icon="cloud" title="No lab resources found">
                    Nothing in {data.region} carries the tag {data.filter.tagKey}=
                    {data.filter.tagValue} or the {data.filter.namingPrefix} naming convention.
                  </EmptyState>
                </CardBody>
              </Card>
            ) : (
              <div className="service-list">
                {services.map((entry) => (
                  <ServiceSection key={entry.service} service={entry} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

export default InfrastructurePage;
