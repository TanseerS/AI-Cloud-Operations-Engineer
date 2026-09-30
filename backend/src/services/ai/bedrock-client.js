import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

import config from '../../config/index.js';
import { describeAwsError } from '../aws/clients.js';
import { ANALYSIS_SCHEMA, TOOL_NAME } from './schema.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';

/**
 * Bedrock invocation.
 *
 * Structured output is obtained by forcing a tool call rather than asking for JSON in
 * prose. The schema becomes the tool's input schema, so the model returns a parsed
 * object and there is no fenced-code or trailing-prose to strip. Models that answer in
 * text anyway are handled, but that is the fallback, not the design.
 *
 * Model access in Bedrock is per account, per model and per region, and can fail for
 * reasons unrelated to the request. The configured fallbacks are tried in order so one
 * unavailable model does not take the feature down.
 */

let client;
function getClient() {
  if (!client) {
    client = new BedrockRuntimeClient({ region: config.bedrock.region, maxAttempts: 3 });
  }
  return client;
}

const TOOL_CONFIG = {
  tools: [
    {
      toolSpec: {
        name: TOOL_NAME,
        description:
          'Return the cloud operations analysis. Every field must be grounded in the supplied observations.',
        inputSchema: { json: ANALYSIS_SCHEMA },
      },
    },
  ],
  toolChoice: { tool: { name: TOOL_NAME } },
};

/** Some models answer in prose despite a forced tool; salvage JSON rather than failing. */
function extractJsonFromText(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function invokeOne(modelId, context) {
  const startedAt = Date.now();
  const response = await getClient().send(
    new ConverseCommand({
      modelId,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: [{ text: buildUserMessage(context) }] }],
      inferenceConfig: {
        // Always explicit. An unset value reserves the model's maximum against the
        // account throughput quota and causes throttling that looks unrelated.
        maxTokens: config.bedrock.maxTokens,
        temperature: config.bedrock.temperature,
      },
      toolConfig: TOOL_CONFIG,
    }),
  );

  const blocks = response.output?.message?.content ?? [];
  const toolUse = blocks.find((block) => block.toolUse)?.toolUse;
  const text = blocks.map((block) => block.text ?? '').join('').trim();

  return {
    modelId,
    latencyMs: Date.now() - startedAt,
    stopReason: response.stopReason,
    usage: response.usage ?? null,
    viaToolUse: Boolean(toolUse),
    raw: toolUse?.input ?? extractJsonFromText(text),
    // Kept only when nothing parsed, so a failure can be diagnosed without
    // routinely carrying model prose around.
    unparsedText: toolUse || extractJsonFromText(text) ? null : text.slice(0, 600),
  };
}

export async function invokeAnalysis(context) {
  const attempts = [];
  const candidates = [config.bedrock.modelId, ...config.bedrock.fallbackModelIds];

  for (const modelId of candidates) {
    try {
      const result = await invokeOne(modelId, context);
      attempts.push({ modelId, ok: true, viaToolUse: result.viaToolUse, latencyMs: result.latencyMs });
      return { ...result, attempts };
    } catch (error) {
      const described = describeAwsError(error);
      attempts.push({ modelId, ok: false, ...described });
      // A malformed request will fail identically on every model; only keep going
      // when the problem is this model's availability.
      const recoverable =
        described.name === 'AccessDeniedException' ||
        described.name === 'ResourceNotFoundException' ||
        described.name === 'ThrottlingException' ||
        described.name === 'ServiceUnavailableException' ||
        described.name === 'ModelNotReadyException';
      if (!recoverable) break;
    }
  }

  const error = new Error(
    `No configured Bedrock model could be invoked (tried ${candidates.length}): ${
      attempts.map((attempt) => `${attempt.modelId} → ${attempt.message ?? 'ok'}`).join('; ')
    }`,
  );
  error.attempts = attempts;
  throw error;
}

export { extractJsonFromText, TOOL_CONFIG };
