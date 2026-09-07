import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AnalyticsEvent } from './analytics.js';
import { createHttpApp, createServer, shouldUseHttpTransport } from './index.js';

describe('MCP catalog', () => {
  it('lists and calls all eight tools over the protocol', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer({ analytics: false });
    const client = new Client({ name: 'beautiful-solutions-test', version: '1.0.0' });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const catalog = await client.listTools();
      assert.equal(catalog.tools.length, 8);
      assert.ok(catalog.tools.some(tool => tool.name === 'map_challenge'));
      assert.ok(catalog.tools.some(tool => tool.name === 'get_source_info'));

      const calls = [
        ['search_toolbox', { query: 'community ownership housing' }],
        ['list_entries', { type: 'value' }],
        ['get_entry', { id: 'bsol-community-land-trust' }],
        ['get_related_entries', { id: 'bsol-community-land-trust', type: 'principle' }],
        ['map_challenge', { challenge: 'community ownership of land' }],
        ['compare_entries', { ids: ['bsol-community-land-trust', 'bsol-limited-equity-housing-cooperatives'] }],
        ['build_discussion_guide', { ids: ['bsol-community-land-trust'], context: 'housing coalition' }],
        ['get_source_info', {}],
      ] as const;

      for (const [name, args] of calls) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, undefined, `${name} should succeed`);
        assert.match(JSON.stringify(result.content), /CC-BY-NC-SA-4\.0/, `${name} should include attribution`);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe('MCP analytics boundary', () => {
  it('captures initialization and tool-call metadata without arguments or results', async () => {
    const events: AnalyticsEvent[] = [];
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer({
      analytics: {
        capture(event) {
          events.push(event);
        },
      },
    });
    const client = new Client({ name: 'Claude Code — Artem', version: '1.0.0' });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: 'map_challenge',
        arguments: { challenge: 'sensitive local organizing context' },
      });
      assert.equal(result.isError, undefined);
      const errorResult = await client.callTool({
        name: 'get_entry',
        arguments: { id: 'private-missing-entry-id' },
      });
      assert.equal(errorResult.isError, true);

      const initialize = events.find(event => event.event === 'mcp_initialize');
      const toolCalls = events.filter(event => event.event === 'mcp_tool_call');
      const toolCall = toolCalls[0];
      assert.ok(initialize);
      assert.ok(toolCall);
      assert.equal(toolCalls.length, 2);
      assert.equal(toolCall.toolName, 'map_challenge');
      assert.equal(toolCall.isError, false);
      assert.equal(toolCall.clientFamily, 'claude-code');
      assert.equal(toolCall.clientVersion, '1');
      assert.equal(toolCalls[1].toolName, 'get_entry');
      assert.equal(toolCalls[1].isError, true);
      assert.deepEqual(Object.keys(toolCall).sort(), [
        'clientFamily',
        'clientVersion',
        'durationMs',
        'event',
        'isError',
        'sessionId',
        'toolName',
      ]);
      assert.doesNotMatch(
        JSON.stringify(events),
        /sensitive local organizing context|private-missing-entry-id|Community Land Trust/i,
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe('HTTP transport', () => {
  it('selects HTTP explicitly and in Railway deployments', () => {
    assert.equal(shouldUseHttpTransport({}), false);
    assert.equal(shouldUseHttpTransport({ MCP_TRANSPORT: 'http' }), true);
    assert.equal(shouldUseHttpTransport({ RAILWAY_ENVIRONMENT_ID: 'production-id' }), true);
    assert.equal(shouldUseHttpTransport({ RAILWAY_ENVIRONMENT_NAME: 'production' }), false);
  });

  it('serves health, enforces sessions, and supports an MCP client', async () => {
    const app = createHttpApp({ analytics: false });
    const httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
    });
    const address = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const health = await fetch(`${baseUrl}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: 'ok' });

      const missingSession = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      assert.equal(missingSession.status, 400);

      const unknownSession = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-session-id': 'unknown-session',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      assert.equal(unknownSession.status, 404);

      const client = new Client({ name: 'beautiful-solutions-http-test', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
      try {
        await client.connect(transport);
        const catalog = await client.listTools();
        assert.equal(catalog.tools.length, 8);

        const result = await client.callTool({
          name: 'get_entry',
          arguments: { id: 'bsol-community-land-trust' },
        });
        assert.equal(result.isError, undefined);
        assert.match(JSON.stringify(result.content), /Community Land Trust/i);
      } finally {
        await client.close();
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        httpServer.close(error => error ? reject(error) : resolve());
      });
    }
  });

  it('rejects invalid session limits', () => {
    assert.throws(() => createHttpApp({ maxSessions: 0, analytics: false }), /positive integer/);
    assert.throws(() => createHttpApp({ sessionIdleTimeoutMs: 0, analytics: false }), /positive integer/);
  });

  it('caps sessions and expires idle sessions', async () => {
    const app = createHttpApp({ maxSessions: 1, sessionIdleTimeoutMs: 30, analytics: false });
    const httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
    });
    const address = httpServer.address() as AddressInfo;
    const mcpUrl = `http://127.0.0.1:${address.port}/mcp`;
    const initialize = () => fetch(mcpUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'session-boundary-test', version: '1.0.0' },
        },
      }),
    });

    try {
      const first = await initialize();
      assert.equal(first.status, 200);
      const sessionId = first.headers.get('mcp-session-id');
      assert.ok(sessionId);
      await first.text();

      const atCapacity = await initialize();
      assert.equal(atCapacity.status, 503);

      await new Promise(resolve => setTimeout(resolve, 150));
      const expired = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-session-id': sessionId,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      assert.equal(expired.status, 404);

      const afterExpiry = await initialize();
      assert.equal(afterExpiry.status, 200);
      const replacementSessionId = afterExpiry.headers.get('mcp-session-id');
      assert.ok(replacementSessionId);
      await afterExpiry.text();

      const closed = await fetch(mcpUrl, {
        method: 'DELETE',
        headers: {
          'mcp-protocol-version': '2025-03-26',
          'mcp-session-id': replacementSessionId,
        },
      });
      assert.equal(closed.status, 200);
    } finally {
      await new Promise<void>((resolve, reject) => {
        httpServer.close(error => error ? reject(error) : resolve());
      });
    }
  });
});
