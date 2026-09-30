import { SEVERITY_TONE } from './severity.js';

const STATUS_COPY = {
  healthy: 'No findings above the reporting threshold',
  degraded: 'Findings present, none critical',
  unhealthy: 'Significant findings need attention',
  critical: 'Critical findings affecting availability',
};

const STATUS_TONE = { healthy: 'success', degraded: 'warning', unhealthy: 'warning', critical: 'danger' };

/**
 * The score is a rollup of the findings below it, not a separate measurement. The ring
 * is a proportion, and the number is stated in text beside it, so the reading never
 * depends on judging an arc.
 */
export function HealthScore({ score, status, totalIssues, resourcesAnalysed }) {
  const size = 132;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const tone = STATUS_TONE[status] ?? 'neutral';

  return (
    <div className="health-score">
      <div className="health-score__ring">
        <svg width={size} height={size} role="img" aria-label={`Health score ${score} out of 100, ${status}`}>
          <circle className="health-score__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
          <circle
            className={`health-score__value health-score__value--${tone}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span className="health-score__number tabular">{score}</span>
      </div>

      <div className="health-score__body">
        <span className={`health-score__status health-score__status--${tone}`}>{status}</span>
        <p className="health-score__copy">{STATUS_COPY[status] ?? ''}</p>
        <p className="health-score__meta">
          {totalIssues} {totalIssues === 1 ? 'finding' : 'findings'} across {resourcesAnalysed} analysed resources
        </p>
      </div>
    </div>
  );
}

export { SEVERITY_TONE };
export default HealthScore;
