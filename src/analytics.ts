import { createHash } from 'node:crypto';

export type ClientFamily =
  | 'chatgpt'
  | 'claude'
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'mcp-inspector'
  | 'opencode'
  | 'other'
  | 'vscode'
  | 'zed';

interface ClientMetadata {
  clientFamily?: ClientFamily;
  clientVersion?: string;
}

export type AnalyticsEvent =
  | {
      event: 'mcp_initialize';
      sessionId: string;
    } & ClientMetadata
  | {
      event: 'mcp_tool_call';
      sessionId: string;
      toolName: string;
      durationMs: number;
      isError: boolean;
    } & ClientMetadata;

export interface Analytics {
  capture(event: AnalyticsEvent): Promise<void> | void;
}

export function captureAnalytics(analytics: Analytics | undefined, event: AnalyticsEvent) {
  if (!analytics) return;
  try {
    void Promise.resolve(analytics.capture(event)).catch(() => undefined);
  } catch {
    // Analytics must never affect MCP behavior.
  }
}

interface PostHogAnalyticsOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const POSTHOG_BATCH_URL = 'https://us.i.posthog.com/batch/';
const SERVER_NAME = 'beautiful-solutions';
const SERVER_VERSION = '0.1.1';
const CLIENT_FAMILIES: ReadonlyArray<readonly [string, ClientFamily]> = [
  ['claude code', 'claude-code'],
  ['claude', 'claude'],
  ['chatgpt', 'chatgpt'],
  ['codex', 'codex'],
  ['cursor', 'cursor'],
  ['gemini', 'gemini'],
  ['mcp inspector', 'mcp-inspector'],
  ['opencode', 'opencode'],
  ['visual studio code', 'vscode'],
  ['vscode', 'vscode'],
  ['zed', 'zed'],
];
const SAFE_VERSION = /^(\d{1,3})(?:\.\d{1,3}){0,3}(?:[-+][0-9A-Za-z.-]{1,16})?$/;

function anonymousDistinctId(sessionId: string) {
  return `mcp:${createHash('sha256').update(sessionId).digest('hex')}`;
}

function majorVersion(version: string) {
  return SAFE_VERSION.exec(version)?.[1];
}

export function classifyClient(client: { name: string; version: string } | undefined) {
  if (!client) return {};
  const normalizedName = client.name.toLowerCase();
  const family = CLIENT_FAMILIES.find(([candidate]) => normalizedName.includes(candidate))?.[1] ?? 'other';
  const version = majorVersion(client.version);
  return {
    clientFamily: family,
    ...(family !== 'other' && version
      ? { clientVersion: version }
      : {}),
  };
}

export function createPostHogAnalytics(
  options: PostHogAnalyticsOptions = {},
): Analytics | undefined {
  const apiKey = options.apiKey ?? process.env.POSTHOG_API_KEY;
  if (!apiKey) return undefined;

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async capture(event) {
      const properties: Record<string, string | number | boolean> = {
        distinct_id: anonymousDistinctId(event.sessionId),
        source: 'book-power-mcp',
        server_name: SERVER_NAME,
        server_version: SERVER_VERSION,
        $process_person_profile: false,
      };

      if (event.clientFamily) properties.client_name = event.clientFamily;
      const version = event.clientVersion && majorVersion(event.clientVersion);
      if (version) properties.client_version = version;
      if (event.event === 'mcp_tool_call') {
        properties.tool_name = event.toolName;
        properties.duration_ms = event.durationMs;
        properties.is_error = event.isError;
      }

      try {
        await fetchImpl(POSTHOG_BATCH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(2_000),
          body: JSON.stringify({
            api_key: apiKey,
            batch: [{
              event: event.event,
              properties,
              timestamp: now().toISOString(),
            }],
          }),
        });
      } catch {
        // Analytics must never affect MCP behavior.
      }
    },
  };
}

function resultIsError(result: unknown) {
  return Boolean(result && typeof result === 'object' && 'isError' in result && result.isError === true);
}

export async function withToolCallAnalytics<T>(
  analytics: Analytics | undefined,
  event: Omit<Extract<AnalyticsEvent, { event: 'mcp_tool_call' }>, 'durationMs' | 'isError'>,
  handler: () => T | Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await handler();
    captureAnalytics(analytics, {
      ...event,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      isError: resultIsError(result),
    });
    return result;
  } catch (error) {
    captureAnalytics(analytics, {
      ...event,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      isError: true,
    });
    throw error;
  }
}
