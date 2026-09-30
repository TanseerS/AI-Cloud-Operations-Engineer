import serverlessExpress from 'serverless-http';

import { createApp } from '../app.js';

/**
 * The API, running on Lambda behind API Gateway.
 *
 * The Express application is reused as-is rather than rewritten as individual handlers.
 * Every route, middleware and service behaves identically to local development, so there
 * is one implementation to reason about and local runs stay representative.
 *
 * The app is built once per container and reused across invocations, so warm requests
 * skip construction and keep the service caches the discovery, cost, health and analysis
 * services already maintain.
 */

let handlerPromise;

function build() {
  const app = createApp();
  return serverlessExpress(app, {
    // API Gateway HTTP API payload format.
    provider: 'aws',
    binary: false,
    request(request, event, context) {
      // Correlate a log line with the API Gateway request that produced it. No payload
      // is copied here - only the identifier.
      request.awsRequestId = context?.awsRequestId ?? null;
      request.apiRequestId = event?.requestContext?.requestId ?? null;
    },
  });
}

export async function handler(event, context) {
  // Responses are returned as soon as the handler resolves; the container is reused, so
  // waiting for an empty event loop would only add latency.
  context.callbackWaitsForEmptyEventLoop = false;

  if (!handlerPromise) handlerPromise = Promise.resolve(build());
  const express = await handlerPromise;
  return express(event, context);
}

export default handler;
