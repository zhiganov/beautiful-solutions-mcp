import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  captureAnalytics,
  classifyClient,
  createPostHogAnalytics,
  withToolCallAnalytics,
  type AnalyticsEvent,
} from './analytics.js';

describe('metadata-only analytics', () => {
  it('stays disabled without a PostHog project token', () => {
    assert.equal(createPostHogAnalytics({ apiKey: '' }), undefined);
  });

  it('reduces client-provided identity strings to a safe software family', () => {
    assert.deepEqual(
      classifyClient({ name: 'Claude Code — Jane Example', version: '1.2.3' }),
      { clientFamily: 'claude-code', clientVersion: '1' },
    );
    assert.deepEqual(
      classifyClient({ name: 'Jane Example private client', version: 'jane@example.org' }),
      { clientFamily: 'other' },
    );
    assert.deepEqual(
      classifyClient({ name: 'Claude Code', version: '15551234567' }),
      { clientFamily: 'claude-code' },
    );
  });

  it('sends only the approved metadata allowlist', async () => {
    let requestUrl: string | undefined;
    let requestBody: unknown;
    const fetchImpl: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    };
    const analytics = createPostHogAnalytics({
      apiKey: 'phc_test',
      fetchImpl,
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    });

    assert.ok(analytics);
    await analytics.capture({
      event: 'mcp_tool_call',
      sessionId: 'private-session-id',
      toolName: 'map_challenge',
      durationMs: 42,
      isError: false,
      clientFamily: 'claude-code',
      clientVersion: '1.2.3',
    });

    assert.equal(requestUrl, 'https://us.i.posthog.com/batch/');
    assert.deepEqual(requestBody, {
      api_key: 'phc_test',
      batch: [{
        event: 'mcp_tool_call',
        properties: {
          distinct_id: 'mcp:e9cac695f668f1f8ebfcabf1b002a5659ae557231252907703b8db2b204f786f',
          source: 'book-power-mcp',
          server_name: 'beautiful-solutions',
          server_version: '0.1.1',
          $process_person_profile: false,
          client_name: 'claude-code',
          client_version: '1',
          tool_name: 'map_challenge',
          duration_ms: 42,
          is_error: false,
        },
        timestamp: '2026-09-07T12:00:00.000Z',
      }],
    });
    assert.doesNotMatch(JSON.stringify(requestBody), /private-session-id/);
  });

  it('does not let exporter failures change tool results', async () => {
    const rejectedEvents: AnalyticsEvent[] = [];
    const analytics = {
      capture(event: AnalyticsEvent) {
        rejectedEvents.push(event);
        return Promise.reject(new Error('PostHog unavailable'));
      },
    };

    const result = await withToolCallAnalytics(
      analytics,
      { event: 'mcp_tool_call', sessionId: 'session', toolName: 'get_source_info' },
      () => 'unchanged',
    );
    assert.equal(result, 'unchanged');
    assert.equal(rejectedEvents.length, 1);

    assert.doesNotThrow(() => captureAnalytics({
      capture() {
        throw new Error('synchronous exporter failure');
      },
    }, { event: 'mcp_initialize', sessionId: 'session' }));
  });
});
