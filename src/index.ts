#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { ENTRY_TYPES } from './types.js';
import {
  buildDiscussionGuide,
  compareEntries,
  getEntry,
  getRelatedEntries,
  getSourceInfo,
  listEntries,
  mapChallenge,
  searchToolbox,
} from './toolbox.js';

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  };
}

function safe(handler: () => unknown) {
  try {
    return jsonResult(handler());
  } catch (error) {
    return errorResult(error);
  }
}

export function createServer() {
  const server = new McpServer({ name: 'beautiful-solutions', version: '0.1.0' });

  server.registerTool('search_toolbox', {
    title: 'Search Beautiful Solutions',
    description: 'Search the Beautiful Solutions values, principles, questions, solutions, and stories. Results are deterministic source matches, not recommendations.',
    inputSchema: {
      query: z.string().min(2).describe('Words or phrase describing a challenge, model, place, or topic'),
      type: z.enum(ENTRY_TYPES).optional().describe('Optional source type filter'),
      sector: z.string().optional().describe('Optional exact sector filter; use list_entries to discover sectors'),
      max_results: z.number().int().min(1).max(20).optional().describe('Maximum results (default: 10)'),
    },
  }, async ({ query, type, sector, max_results }) => safe(() =>
    searchToolbox(query, { type, sector, limit: max_results ?? 10 })));

  server.registerTool('list_entries', {
    title: 'Browse Beautiful Solutions Entries',
    description: 'List compact source entries, optionally filtered by toolbox type or sector.',
    inputSchema: {
      type: z.enum(ENTRY_TYPES).optional().describe('Optional source type filter'),
      sector: z.string().optional().describe('Optional exact sector filter'),
      max_results: z.number().int().min(1).max(100).optional().describe('Maximum entries (default: all matching entries)'),
    },
  }, async ({ type, sector, max_results }) => safe(() =>
    listEntries({ type, sector, limit: max_results })));

  server.registerTool('get_entry', {
    title: 'Read a Beautiful Solutions Entry',
    description: 'Get one complete adapted entry with authors, references, source relationships, canonical URL, and CC attribution.',
    inputSchema: {
      id: z.string().describe('Entry ID, such as bsol-community-land-trust'),
    },
  }, async ({ id }) => safe(() => getEntry(id)));

  server.registerTool('get_related_entries', {
    title: 'Follow Source Relationships',
    description: 'Get entries connected to one entry by the official Beautiful Trouble source graph. No relationships are inferred.',
    inputSchema: {
      id: z.string().describe('Source entry ID'),
      type: z.enum(ENTRY_TYPES).optional().describe('Optional related-entry type filter'),
    },
  }, async ({ id, type }) => safe(() => getRelatedEntries(id, type)));

  server.registerTool('map_challenge', {
    title: 'Map a Challenge Across Toolbox Lenses',
    description: 'Surface source-grounded questions, values, principles, solutions, and stories relevant to a challenge. Relevance is lexical and relational, not prescriptive.',
    inputSchema: {
      challenge: z.string().min(3).describe('The challenge or opportunity to explore'),
      sector: z.string().optional().describe('Optional exact sector filter'),
      max_per_type: z.number().int().min(1).max(5).optional().describe('Maximum entries per toolbox type (default: 3)'),
    },
  }, async ({ challenge, sector, max_per_type }) => safe(() =>
    mapChallenge(challenge, { sector, maxPerType: max_per_type })));

  server.registerTool('compare_entries', {
    title: 'Compare Source Entries',
    description: 'Place two to six entries side by side using source fields. The tool does not rank models or declare a best choice.',
    inputSchema: {
      ids: z.array(z.string()).min(2).max(6).describe('Two to six entry IDs'),
    },
  }, async ({ ids }) => safe(() => compareEntries(ids)));

  server.registerTool('build_discussion_guide', {
    title: 'Build a Source-Grounded Discussion Guide',
    description: 'Assemble an attributed class, book-club, or community discussion scaffold from one to five selected entries and their source-linked questions and values.',
    inputSchema: {
      ids: z.array(z.string()).min(1).max(5).describe('One to five entry IDs to anchor the discussion'),
      context: z.string().optional().describe('Short description of the group or situation'),
    },
  }, async ({ ids, context }) => safe(() => buildDiscussionGuide(ids, context)));

  server.registerTool('get_source_info', {
    title: 'Inspect Source, License, and Integrity',
    description: 'Get source inventory, provenance, CC BY-NC-SA 4.0 conditions, adaptation notes, limitations, and snapshot integrity.',
    inputSchema: {},
  }, async () => safe(getSourceInfo));

  return server;
}

export async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(error => {
    console.error('Beautiful Solutions MCP failed to start:', error);
    process.exitCode = 1;
  });
}
