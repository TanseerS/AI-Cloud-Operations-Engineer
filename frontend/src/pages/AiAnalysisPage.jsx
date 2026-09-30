import { useCallback, useState } from 'react';

import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Callout from '../components/ui/Callout.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import ModelStatus from '../components/ai/ModelStatus.jsx';
import FindingCard from '../components/ai/FindingCard.jsx';
import RecommendationGroup from '../components/ai/RecommendationGroup.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatDuration, formatRelative } from '../lib/format.js';

/**
 * The AI layer runs only when asked.
 *
 * Nothing on this page invokes Bedrock on mount. The status call is free, the findings
 * come from an explicit POST, and the backend additionally caches and rate-limits, so a
 * held-down button cannot meter the account.
 */
export function AiAnalysisPage() {
  const status = useApiResource(api.aiStatus);
  const health = useApiResource(api.healthAnalysis);

  const [state, setState] = useState({ phase: 'idle', data: null, error: null, ranMs: null });

  const runAnalysis = useCallback(
    async (force = false) => {
      setState((prev) => ({ ...prev, phase: 'running', error: null }));
      const startedAt = performance.now();
      try {
        const { data } = await api.aiAnalyze({ force });
        setState({ phase: 'done', data, error: null, ranMs: Math.round(performance.now() - startedAt) });
        status.reload();
      } catch (error) {
        setState({ phase: 'error', data: null, error, ranMs: null });
      }
    },
    [status],
  );

  const result = state.data;
  const analysis = result?.ok ? result.analysis : null;
  const issuesById = new Map((health.data?.issues ?? []).map((issue) => [issue.id, issue]));
  const busy = state.phase === 'running';

  return (
    <>
      <PageHeader
        title="AI analysis"
        subtitle="An AWS Cloud Operations Engineer persona on Amazon Bedrock reasons over the observations this application already collected. It is given no other data, and anything it names that we did not observe is rejected before you see it."
        aside={
          <>
            {result?.cached ? <Badge tone="outline">cached result</Badge> : null}
            <Button variant="primary" onClick={() => runAnalysis(false)} disabled={busy}>
              <Icon name="sparkle" size={14} />
              {busy ? 'Analysing' : result ? 'Re-run analysis' : 'Run analysis'}
            </Button>
          </>
        }
      />

      <ModelStatus
        status={status.data}
        lastModelUsed={result?.model?.modelIdUsed}
        reachable={result ? result.ok || result.failure?.stage !== 'invocation' : undefined}
      />

      {state.phase === 'idle' ? (
        <Card>
          <CardBody>
            <EmptyState icon="sparkle" title="Analysis has not been run">
              Bedrock is invoked only when you ask for it, because each analysis costs money.
              The backend assembles the context from the discovered architecture, Cost Explorer
              data and the CloudWatch findings — the browser sends no AWS data.
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={() => runAnalysis(false)} disabled={busy}>
                <Icon name="sparkle" size={14} />
                Run analysis
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {busy ? (
        <>
          <Callout tone="info" title="Invoking Bedrock">
            Collecting the latest discovery, cost and health observations, then asking the model to
            reason over them. This usually takes fifteen to thirty seconds.
          </Callout>
          <SkeletonCard rows={4} />
        </>
      ) : null}

      {state.phase === 'error' ? (
        <Card>
          <CardBody>
            <EmptyState icon="plug" title="Could not reach the analysis API">
              {state.error?.message}. The backend must be running.
            </EmptyState>
            <div className="empty__actions">
              <Button variant="primary" onClick={() => runAnalysis(false)}>
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {result && !result.ok ? (
        <Card>
          <CardBody>
            <EmptyState icon="issues" title={`Analysis failed at the ${result.failure.stage} stage`}>
              {result.failure.message}
            </EmptyState>
            {result.failure.attempts?.length ? (
              <div className="detail-list">
                {result.failure.attempts.map((attempt, index) => (
                  <div key={index} className="detail-row">
                    <span className="detail-row__key mono">{attempt.modelId}</span>
                    <span className="detail-row__value">{attempt.message ?? 'ok'}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {result.failure.errors?.length ? (
              <ul className="billing-notes">
                {result.failure.errors.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            ) : null}
            <div className="empty__actions">
              <Button variant="primary" onClick={() => runAnalysis(true)}>
                Retry
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {analysis ? (
        <>
          {result.throttledByPolicy ? (
            <Callout tone="info" title="Showing the previous result">
              {result.throttledByPolicy.message} Retry in about{' '}
              {result.throttledByPolicy.retryAfterSeconds}s for a fresh analysis.
            </Callout>
          ) : null}

          {result.grounding && !result.grounding.fullyGrounded ? (
            <Callout
              tone="warning"
              title={`${result.grounding.findingsRejected} finding(s) rejected as ungrounded`}
            >
              The model referenced issues or resources that were never observed. They have been
              removed rather than shown as real.
              {result.rejectedFindings?.map((entry, index) => (
                <p key={index}>{entry.reason}</p>
              ))}
            </Callout>
          ) : null}

          <Card className="ai-assessment">
            <div className="ai-assessment__body">
              <h2 className="ai-assessment__heading">Overall assessment</h2>
              <p className="ai-assessment__summary">{analysis.summary}</p>
              <p className="ai-assessment__detail">{analysis.overallAssessment}</p>
            </div>
            <div className="ai-assessment__meta">
              <div className="health-banner__row">
                <span className="health-banner__key">Grounding</span>
                <span className="health-banner__value">
                  <Badge tone={result.grounding.fullyGrounded ? 'success' : 'warning'}>
                    {result.grounding.findingsAccepted} of{' '}
                    {result.grounding.findingsAccepted + result.grounding.findingsRejected} findings verified
                  </Badge>
                </span>
              </div>
              <div className="health-banner__row">
                <span className="health-banner__key">Context sent</span>
                <span className="health-banner__value tabular">
                  {(result.context.bytes / 1024).toFixed(1)} KB · {result.context.issues} issues ·{' '}
                  {result.context.resources} resources
                </span>
              </div>
              <div className="health-banner__row">
                <span className="health-banner__key">Model latency</span>
                <span className="health-banner__value tabular">
                  {formatDuration(result.model.latencyMs)}
                  {result.model.usage
                    ? ` · ${result.model.usage.inputTokens} in / ${result.model.usage.outputTokens} out`
                    : ''}
                </span>
              </div>
              <div className="health-banner__row">
                <span className="health-banner__key">Generated</span>
                <span className="health-banner__value">{formatRelative(result.generatedAt)}</span>
              </div>
            </div>
          </Card>

          <section className="section">
            <div className="section__header">
              <h2 className="section__title">Findings and root causes</h2>
              <p className="section__hint">Each joined to the deterministic issue it explains</p>
            </div>
            {analysis.findings.length === 0 ? (
              <Card>
                <CardBody>
                  <EmptyState icon="activity" title="No findings returned">
                    The model did not produce a finding for any detected issue.
                  </EmptyState>
                </CardBody>
              </Card>
            ) : (
              <div className="ai-finding-list">
                {analysis.findings.map((finding) => (
                  <FindingCard key={finding.issueId} finding={finding} issue={issuesById.get(finding.issueId)} />
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="two-column two-column--wide">
              <RecommendationGroup
                title="Cost opportunities"
                description="Savings the supplied cost and configuration data supports"
                icon="cost"
                items={analysis.costOptimization}
              />
              <RecommendationGroup
                title="Reliability"
                description="Changes proposed to reduce failure"
                icon="activity"
                items={analysis.reliabilityRecommendations}
              />
            </div>
          </section>

          <section className="section">
            <div className="two-column two-column--wide">
              <RecommendationGroup
                title="Performance"
                description="Observations about latency and execution"
                icon="activity"
                items={analysis.performanceRecommendations}
              />
              <Card>
                <CardHeader
                  title="Insufficient evidence"
                  description="What the model declined to conclude, and why that matters"
                />
                <CardBody flush>
                  {analysis.insufficientEvidence?.length ? (
                    <ul className="billing-notes">
                      {analysis.insufficientEvidence.map((entry, index) => (
                        <li key={index}>{entry}</li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon="activity" title="Nothing flagged">
                      The model reported that the supplied observations were sufficient for every
                      conclusion it drew.
                    </EmptyState>
                  )}
                </CardBody>
              </Card>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

export default AiAnalysisPage;
