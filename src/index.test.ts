import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './index.js';

describe('MCP catalog', () => {
  it('lists and calls all eight tools over the protocol', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
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
