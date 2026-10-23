import { Link } from 'react-router-dom';

import Icon from '../ui/Icon.jsx';
import { SEVERITY_ORDER, SEVERITY_TONE } from '../health/severity.js';
import { formatCurrency } from '../../lib/currency.js';
import { formatRelative, EMPTY } from '../../lib/format.js';

/**
 * The bento grid.
 *
 * Six destinations, each card previewing the view it leads to rather than describing it.
 * A list of links tells you a dashboard has pages; a preview tells you what is in them,
 * which is the only version worth putting on a landing page.
 *
 * Every preview is built from the overview payload this page already loaded - the same
 * numbers the tiles above are showing. Nothing here is illustrative: when a section is
 * unavailable the card says so and shows no figures, because a card that invents a
 * plausible chart to look complete is worse than one with a gap in it.
 */

/* --------------------------------------------------------------- previews */

/** Architecture: the real service mix, as the proportions discovery actually found. */
function TopologyPreview({ resources }) {
  if (!resources?.available) return <Unavailable />;
  const entries = Object.entries(resources.byService ?? {});
  if (entries.length === 0) return <Unavailable label="Nothing discovered" />;
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="bento-preview bento-preview--topology">
      {entries.map(([service, count]) => (
        <div className="topo-row" key={service}>
          <span className="topo-row__name mono">{service}</span>
          <span className="topo-row__track">
            <span className="topo-row__bar" style={{ width: `${Math.max(6, (count / total) * 100)}%` }} />
          </span>
          <span className="topo-row__count tabular">{count}</span>
        </div>
      ))}
    </div>
  );
}

/** Cost: the largest real driver, at its real share of the period. */
function CostPreview({ cost }) {
  if (!cost?.available) return <Unavailable />;
  const driver = cost.topService;

  return (
    <div className="bento-preview bento-preview--cost">
      <p className="bento-figure tabular">
        {cost.usageCost === null ? EMPTY : formatCurrency(cost.usageCost, cost.currency)}
      </p>
      <p className="bento-figure__note">
        {cost.period ?? 'current period'} · not real time
      </p>
      {driver ? (
        <div className="cost-driver">
          <span className="cost-driver__name">{driver.service}</span>
          <span className="cost-driver__track">
            <span className="cost-driver__bar" style={{ width: `${Math.min(100, driver.percentage)}%` }} />
          </span>
          <span className="cost-driver__value tabular">{formatCurrency(driver.cost, cost.currency)}</span>
        </div>
      ) : (
        <p className="bento-preview__empty">No charges posted in this period yet.</p>
      )}
    </div>
  );
}

/** Health: the real severity spread, and the worst finding by name. */
function HealthPreview({ health }) {
  if (!health?.available) return <Unavailable />;
  const counts = health.countsBySeverity ?? {};
  const worst = health.topIssues?.[0];

  return (
    <div className="bento-preview bento-preview--health">
      <div className="sev-strip">
        {SEVERITY_ORDER.filter((s) => s !== 'info').map((severity) => (
          <span key={severity} className={`sev-chip sev-chip--${SEVERITY_TONE[severity] ?? 'neutral'}`}>
            <span className="sev-chip__count tabular">{counts[severity] ?? 0}</span>
            <span className="sev-chip__label">{severity}</span>
          </span>
        ))}
      </div>
      {worst ? (
        <p className="bento-line">
          <span className={`sev-dot sev-dot--${SEVERITY_TONE[worst.severity] ?? 'neutral'}`} aria-hidden="true" />
          {worst.title}
        </p>
      ) : (
        <p className="bento-preview__empty">Nothing is currently failing.</p>
      )}
    </div>
  );
}

/** AI: what the model is given, stated as the counts it will actually reason over. */
function AiPreview({ health, resources }) {
  if (!health?.available) return <Unavailable />;

  return (
    <div className="bento-preview bento-preview--ai">
      <div className="ai-rows">
        <div className="ai-row">
          <span className="ai-row__key">Findings in context</span>
          <span className="ai-row__val tabular">{health.totalIssues}</span>
        </div>
        <div className="ai-row">
          <span className="ai-row__key">Resources it may name</span>
          <span className="ai-row__val tabular">
            {resources?.available ? resources.total : EMPTY}
          </span>
        </div>
        <div className="ai-row">
          <span className="ai-row__key">Anything else</span>
          <span className="ai-row__val ai-row__val--muted">rejected</span>
        </div>
      </div>
    </div>
  );
}

/** Remediation: the real plan ledger. */
function RemediationPreview({ remediation }) {
  if (!remediation?.available) return <Unavailable />;

  const cells = [
    { label: 'Verified', value: remediation.verified },
    { label: 'Approved', value: remediation.approved },
    { label: 'Awaiting', value: remediation.awaitingApproval },
    { label: 'Advice only', value: remediation.recommendationOnly },
  ];

  return (
    <div className="bento-preview bento-preview--remediation">
      {cells.map((cell) => (
        <div className="ledger-cell" key={cell.label}>
          <span className="ledger-cell__value tabular">{cell.value}</span>
          <span className="ledger-cell__label">{cell.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Lab: the real state and the real schedule. */
function LabPreview({ lab }) {
  if (!lab?.available) return <Unavailable />;

  return (
    <div className="bento-preview bento-preview--lab">
      <p className={`lab-state lab-state--${lab.state}`}>
        {lab.state === 'broken' ? 'Intentionally broken' : lab.state}
      </p>
      <div className="ai-rows">
        <div className="ai-row">
          <span className="ai-row__key">Matches baseline</span>
          <span className="ai-row__val">{lab.matchesBaseline ? 'Yes' : 'No'}</span>
        </div>
        <div className="ai-row">
          <span className="ai-row__key">Last reset</span>
          <span className="ai-row__val">{lab.lastReset ? formatRelative(lab.lastReset) : EMPTY}</span>
        </div>
        <div className="ai-row">
          <span className="ai-row__key">Auto-check</span>
          <span className="ai-row__val">
            {lab.automationEnabled ? `every ${lab.intervalHours}h` : 'off'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Unavailable({ label = 'Unavailable' }) {
  return (
    <div className="bento-preview bento-preview--unavailable">
      <p className="bento-preview__empty">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ grid */

export function NextSteps({ data }) {
  const cards = [
    {
      to: '/architecture',
      icon: 'architecture',
      title: 'Architecture',
      body: 'What exists and how it connects',
      preview: <TopologyPreview resources={data.resources} />,
    },
    {
      to: '/cost',
      icon: 'cost',
      title: 'Costs',
      body: 'What it spends and where',
      preview: <CostPreview cost={data.cost} />,
    },
    {
      to: '/issues',
      icon: 'issues',
      title: 'Health & issues',
      body: 'What is wrong, with evidence',
      preview: <HealthPreview health={data.health} />,
    },
    {
      to: '/ai',
      icon: 'sparkle',
      title: 'AI analysis',
      body: 'Root cause reasoning over that evidence',
      preview: <AiPreview health={data.health} resources={data.resources} />,
    },
    {
      to: '/remediation',
      icon: 'remediation',
      title: 'Remediation',
      body: 'Approve a fix, apply it, verify it',
      preview: <RemediationPreview remediation={data.remediation} />,
    },
    {
      to: '/lab',
      icon: 'reset',
      title: 'Lab control',
      body: 'Reset the environment and start again',
      preview: <LabPreview lab={data.lab} />,
    },
  ];

  return (
    <section className="section bento">
      <div className="bento__hub">
        <span className="bento__node">
          <Icon name="activity" size={14} />
          AI Cloud Operations Engineer
        </span>
        {/* Decorative: the paths restate the grid below, which is already navigable. */}
        <svg className="bento__wires" viewBox="0 0 900 72" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M450 0 V26 Q450 36 440 36 H160 Q150 36 150 46 V72" />
          <path d="M450 0 V72" />
          <path d="M450 0 V26 Q450 36 460 36 H740 Q750 36 750 46 V72" />
        </svg>
      </div>

      <div className="bento__grid">
        {cards.map((card, index) => (
          <Link
            key={card.to}
            to={card.to}
            className="bento-card"
            style={{ '--bento-index': index }}
          >
            <span className="bento-card__head">
              <span className="bento-card__icon">
                <Icon name={card.icon} size={14} />
              </span>
              <span className="bento-card__title">{card.title}</span>
              <Icon name="chevron" size={13} className="bento-card__chevron" />
            </span>
            <span className="bento-card__body">{card.body}</span>
            <span className="bento-card__preview">{card.preview}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default NextSteps;
