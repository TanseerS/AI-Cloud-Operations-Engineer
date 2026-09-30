import { GetResourcesCommand } from '@aws-sdk/client-resource-groups-tagging-api';

import config from '../../config/index.js';
import { getTaggingClient, toTagMap, describeAwsError } from './clients.js';

/**
 * The single answer to "does this AWS resource belong to our lab?".
 *
 * An AWS account holds other people's work. Every discovery service routes through
 * this module so one convention governs the boundary, and widening it later is a
 * one-file change rather than an audit of every collector.
 *
 * Two independent signals, in order of trust:
 *
 *   1. Tags. Project=ai-cloud-operations-engineer is the contract. The Resource Groups
 *      Tagging API answers this for every service in one call, so the common case costs
 *      no per-resource lookups.
 *   2. Naming convention. The tag index is eventually consistent and some resources are
 *      awkward to tag, so a name matching the aicoe-lab convention also counts.
 *
 * Anything matching neither is somebody else's resource and is never returned.
 */

export const LAB_TAG_KEY = 'Project';
export const LAB_TAG_VALUE = 'ai-cloud-operations-engineer';

/**
 * The application's own automation carries the project tags, because it belongs to the
 * project - but it is not part of the environment being demonstrated. Including it would
 * mean the dashboard reported findings against the scheduler that keeps the lab broken,
 * and the reset baseline has no entry for them, so nothing could ever resolve them.
 *
 * Resources tagged Component=automation are therefore excluded from lab discovery.
 */
export const COMPONENT_TAG_KEY = 'Component';
export const AUTOMATION_COMPONENT = 'automation';

export function isAutomationComponent(tags) {
  return toTagMap(tags)[COMPONENT_TAG_KEY] === AUTOMATION_COMPONENT;
}

const PREFIX = config.aws.labPrefix;

/** Name shapes our convention produces: bare names, log-group paths, SSM paths. */
export function matchesNamingConvention(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  // The automation's own resources use the same prefix but are not part of the lab.
  if (
    /^(?:\/aws\/lambda\/)?aicoe-lab-(?:autonomous-manager|automation-role|scheduler-role|autonomous-check)$/.test(name) ||
    name.startsWith(`/${PREFIX}/automation/`)
  ) {
    return false;
  }

  return (
    name === PREFIX ||
    name.startsWith(`${PREFIX}-`) ||
    name.startsWith(`/${PREFIX}/`) ||
    name.startsWith(`/aws/lambda/${PREFIX}-`)
  );
}

export function matchesLabTags(tags) {
  return toTagMap(tags)[LAB_TAG_KEY] === LAB_TAG_VALUE;
}

/**
 * One cross-service lookup of everything carrying the lab tag. Failure is not fatal:
 * discovery falls back to tags returned inline by each service plus the naming
 * convention, and the caller reports the degradation.
 */
export async function buildLabIndex() {
  const index = { arns: new Set(), tagsByArn: new Map(), available: false, error: null };

  try {
    const client = getTaggingClient();
    let paginationToken;

    do {
      const response = await client.send(
        new GetResourcesCommand({
          TagFilters: [{ Key: LAB_TAG_KEY, Values: [LAB_TAG_VALUE] }],
          ResourcesPerPage: 100,
          PaginationToken: paginationToken || undefined,
        }),
      );

      for (const mapping of response.ResourceTagMappingList ?? []) {
        if (!mapping.ResourceARN) continue;
        index.arns.add(mapping.ResourceARN);
        index.tagsByArn.set(mapping.ResourceARN, toTagMap(mapping.Tags));
      }

      paginationToken = response.PaginationToken || undefined;
    } while (paginationToken);

    index.available = true;
  } catch (error) {
    index.error = describeAwsError(error);
  }

  return index;
}

/**
 * Decides membership and records why, so a surprising inclusion can be explained
 * rather than guessed at.
 */
export function classifyResource({ arn, name, tags }, index) {
  const reasons = [];

  // The tool's own scheduling infrastructure is excluded before anything else.
  const indexedTags = arn ? index?.tagsByArn?.get(arn) : undefined;
  if (isAutomationComponent(tags) || isAutomationComponent(indexedTags)) {
    return { isLabResource: false, reasons: [], excluded: 'automation-component' };
  }

  if (arn && index?.arns?.has(arn)) reasons.push('tag-index');
  if (matchesLabTags(tags)) reasons.push('resource-tags');
  if (matchesNamingConvention(name)) reasons.push('naming-convention');

  return { isLabResource: reasons.length > 0, reasons };
}

/** Tags from the index where available, falling back to what the service returned. */
export function resolveTags({ arn, tags }, index) {
  const indexed = arn ? index?.tagsByArn?.get(arn) : undefined;
  return { ...toTagMap(tags), ...(indexed ?? {}) };
}

export default { buildLabIndex, classifyResource, resolveTags, matchesNamingConvention };
