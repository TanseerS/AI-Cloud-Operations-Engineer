import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import StatTile from '../components/ui/StatTile.jsx';
import StatusIndicator from '../components/ui/StatusIndicator.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ResetLabCard from '../components/lab/ResetLabCard.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { useRefresh } from '../context/RefreshContext.jsx';
import { useHealth } from '../context/HealthContext.jsx';
import { api } from '../lib/api.js';
import config from '../lib/config.js';

/** What each API capability will do, so the grid explains the product, not just the routes. */
const CAPABILITY_COPY = {
  health: { icon: 'activity', title: 'API liveness', body: 'Confirms the API process is up. Makes no AWS call, so it answers even when the account does not.' },
  healthAnalysis: { icon: 'issues', title: 'Health & issue detection', body: 'CloudWatch metrics and logs turned into observed facts, then deterministic findings.' },
  infrastructure: { icon: 'server', title: 'Resource discovery', body: 'Enumerates the tagged AWS lab resources into a single live inventory.' },
  architecture: { icon: 'architecture', title: 'Architecture analysis', body: 'Builds the node and edge graph rendered as an interactive diagram.' },
  costs: { icon: 'cost', title: 'Cost analysis', body: 'Cost Explorer spend, split into usage cost and what is actually billed after credits.' },
  aiStatus: { icon: 'sparkle', title: 'AI model status', body: 'Which Bedrock model is active and in which region. Costs nothing to display.' },
  aiAnalyze: { icon: 'sparkle', title: 'Bedrock analysis', body: 'Reasons over the collected observations. Runs only when explicitly requested.' },
  remediationPlan: { icon: 'remediation', title: 'Remediation planning', body: 'Turns findings into single, reversible AWS changes from an allowlisted action registry.' },
  remediationPlans: { icon: 'remediation', title: 'Remediation plans', body: 'Plans with their approval, execution and verification state.' },
  labStatus: { icon: 'reset', title: 'Lab baseline', body: 'What the recorded baseline manages, and how the last reset went.' },
  labReset: { icon: 'reset', title: 'Lab reset', body: 'Restores the intentionally broken baseline, writing back only what differs.' },
};

function DetailRow({ label, children }) {
  return (
    <div className="detail-row">
      <span className="detail-row__key">{label}</span>
      <span className="detail-row__value">{children}</span>
    </div>
  );
}

function connectionTone(status) {
  if (status === 'success') return { tone: 'success', label: 'Connected' };
  if (status === 'error') return { tone: 'danger', label: 'Unreachable' };
  return { tone: 'info', label: 'Checking' };
}

export function OverviewPage() {
  const { refreshToken } = useRefresh();
  const health = useHealth();
  const index = useApiResource(api.index, { refreshToken });

  const connection = connectionTone(health.status);
  const isBusy = health.status === 'loading' || health.status === 'refreshing';

  const endpoints = index.data?.endpoints ?? {};
  const capabilities = Object.entries(endpoints);
  const availableCount = capabilities.filter(([, value]) => value.status === 'available').length;

  const refreshAll = () => {
    health.reload();
    index.reload();
  };

  return (
    <>
      <PageHeader
        title="Operations overview"
        subtitle="Connection status and the capability surface of the AI Cloud Operations Engineer. Analysis modules light up here as each one is built."
        aside={
          <>
            <StatusIndicator tone={connection.tone} label={connection.label} pulse={isBusy} />
            <Button onClick={refreshAll} disabled={isBusy}>
              <Icon name="refresh" size={14} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="stat-grid">
        <StatTile
          label="API status"
          icon="plug"
          value={health.status === 'success' ? 'Operational' : connection.label}
          hint={health.checkedAt ? `Checked ${health.checkedAt.toLocaleTimeString()}` : 'Contacting the API'}
        />
        <StatTile
          label="Round trip"
          icon="activity"
          value={health.latencyMs === null ? '—' : `${health.latencyMs} ms`}
          hint="Browser to API, measured client side"
        />
        <StatTile
          label="AWS region"
          icon="cloud"
          mono
          value={health.data?.region ?? '—'}
          hint="Reported by the API, never set in the browser"
        />
        <StatTile
          label="Capabilities live"
          icon="overview"
          value={capabilities.length ? `${availableCount} / ${capabilities.length}` : '—'}
          hint="Remaining modules answer 501 until built"
        />
      </div>

      <section className="section">
        <div className="two-column">
          <Card>
            <CardHeader title="Backend connection" description="The browser holds no AWS access. Every AWS call happens behind this API." />
            <CardBody flush>
              <div className="detail-list">
                <DetailRow label="Endpoint">
                  <span className="mono">{config.apiBaseUrl}</span>
                </DetailRow>
                <DetailRow label="Status">
                  <StatusIndicator tone={connection.tone} label={connection.label} pulse={isBusy} />
                </DetailRow>
                <DetailRow label="Latency">
                  {health.latencyMs === null ? '—' : `${health.latencyMs} ms`}
                </DetailRow>
                <DetailRow label="Service">
                  <span className="mono">{health.data?.service ?? '—'}</span>
                </DetailRow>
                <DetailRow label="API version">
                  <span className="mono">{health.data?.version ?? '—'}</span>
                </DetailRow>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Environment" description="Resolved from environment variables at build and run time." />
            <CardBody flush>
              <div className="detail-list">
                <DetailRow label="Frontend mode">
                  <Badge tone="outline">{config.appEnv}</Badge>
                </DetailRow>
                <DetailRow label="Backend environment">
                  {health.data?.environment ? (
                    <Badge tone="outline">{health.data.environment}</Badge>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label="Backend uptime">
                  {health.data?.uptimeSeconds === undefined ? '—' : `${health.data.uptimeSeconds}s`}
                </DetailRow>
                <DetailRow label="AWS credentials in browser">
                  <Badge tone="success">None</Badge>
                </DetailRow>
                <DetailRow label="Lab connection">
                  <Badge tone="outline">Not wired yet</Badge>
                </DetailRow>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <section className="section">
        <ResetLabCard />
      </section>

      <section className="section">
        <div className="section__header">
          <h2 className="section__title">Capabilities</h2>
          <p className="section__hint">Read live from the API index</p>
        </div>

        {index.status === 'error' ? (
          <Card>
            <CardBody>
              <EmptyState icon="plug" title="API unreachable">
                {index.error?.message}. Start the backend with <code>npm start</code> in{' '}
                <code>backend/</code>, then refresh.
              </EmptyState>
            </CardBody>
          </Card>
        ) : (
          <div className="capability-grid">
            {capabilities.map(([key, value]) => {
              const copy = CAPABILITY_COPY[key] ?? { icon: 'cloud', title: key, body: '' };
              const live = value.status === 'available';
              return (
                <Card key={key} interactive className="capability">
                  <div className="capability__top">
                    <span className="capability__icon">
                      <Icon name={copy.icon} size={16} />
                    </span>
                    <Badge tone={live ? 'success' : 'outline'}>
                      {live ? 'Available' : 'Planned'}
                    </Badge>
                  </div>
                  <div>
                    <p className="capability__name">{copy.title}</p>
                    <p className="capability__description">{copy.body}</p>
                  </div>
                  <p className="capability__path">{value.path}</p>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export default OverviewPage;
