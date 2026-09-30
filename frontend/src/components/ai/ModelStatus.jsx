import Badge from '../ui/Badge.jsx';
import StatusIndicator from '../ui/StatusIndicator.jsx';

/**
 * A quiet strip, not a banner. It answers "which model produced this, and where", which
 * matters when the output is advice. Nothing here identifies the account or a credential.
 */
export function ModelStatus({ status, lastModelUsed, reachable }) {
  if (!status) return null;
  const { model } = status;
  const usedFallback = lastModelUsed && lastModelUsed !== model.modelId;

  return (
    <div className="model-status">
      <StatusIndicator
        tone={reachable === false ? 'danger' : reachable ? 'success' : 'neutral'}
        label={reachable === false ? 'Bedrock unreachable' : reachable ? 'Bedrock reachable' : 'Bedrock configured'}
      />
      <span className="model-status__divider" aria-hidden="true" />
      <span className="model-status__item">
        <span className="model-status__key">Model</span>
        <span className="model-status__value mono">{lastModelUsed ?? model.modelId}</span>
      </span>
      <span className="model-status__item">
        <span className="model-status__key">Region</span>
        <span className="model-status__value mono">{model.region}</span>
      </span>
      {usedFallback ? (
        <Badge tone="warning">fell back from {model.modelId}</Badge>
      ) : null}
      <Badge tone="outline">{model.api}</Badge>
    </div>
  );
}

export default ModelStatus;
