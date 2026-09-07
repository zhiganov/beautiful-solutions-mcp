#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Response } from 'express';
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
  const server = new McpServer({ name: 'beautiful-solutions', version: '0.1.1' });

  server.registerTool('search_toolbox', {
    title: 'Search Beautiful Solutions',
    description: 'Search the Beautiful Solutions values, principles, questions, solutions, stories, and reviewed method cards. Results are deterministic source matches, not recommendations.',
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
    description: 'Get one source-authored summary plus its adapted, manually reviewed method card, authors, references, source relationships, canonical URL, and CC attribution. Complete entry text remains at the canonical source.',
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
    description: 'Place two to six entries and their reviewed method dimensions side by side. The tool does not rank models or declare a best choice.',
    inputSchema: {
      ids: z.array(z.string()).min(2).max(6).describe('Two to six entry IDs'),
    },
  }, async ({ ids }) => safe(() => compareEntries(ids)));

  server.registerTool('build_discussion_guide', {
    title: 'Build a Source-Grounded Discussion Guide',
    description: 'Assemble an attributed discussion scaffold from selected entries, reviewed method cards, adapted transfer questions, and source-linked questions and values.',
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

interface HttpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  idleTimer?: NodeJS.Timeout;
}

export interface HttpAppOptions {
  host?: string;
  maxSessions?: number;
  sessionIdleTimeoutMs?: number;
}

const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function shouldUseHttpTransport(environment: NodeJS.ProcessEnv = process.env) {
  return environment.MCP_TRANSPORT === 'http' || Boolean(environment.RAILWAY_ENVIRONMENT_ID);
}

function sendProtocolError(res: Response, status: number, code: number, message: string) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

export function createHttpApp(options: HttpAppOptions = {}) {
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const sessionIdleTimeoutMs = options.sessionIdleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;

  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new Error('maxSessions must be a positive integer');
  }
  if (!Number.isInteger(sessionIdleTimeoutMs) || sessionIdleTimeoutMs < 1) {
    throw new Error('sessionIdleTimeoutMs must be a positive integer');
  }

  const app = createMcpExpressApp({ host: options.host ?? '127.0.0.1' });
  const sessions = new Map<string, HttpSession>();
  let initializingSessions = 0;

  const removeSession = (sessionId: string, session: HttpSession) => {
    if (sessions.get(sessionId) !== session) return;
    sessions.delete(sessionId);
    if (session.idleTimer) clearTimeout(session.idleTimer);
  };

  const armIdleTimeout = (sessionId: string, session: HttpSession) => {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      removeSession(sessionId, session);
      void session.server.close().catch(error => {
        console.error(`Error closing idle MCP session ${sessionId}:`, error);
      });
    }, sessionIdleTimeoutMs);
    session.idleTimer.unref();
  };

  const getSession = (sessionId: string | undefined, res: Response) => {
    if (!sessionId) {
      sendProtocolError(res, 400, -32000, 'Bad Request: Mcp-Session-Id header is required');
      return undefined;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      sendProtocolError(res, 404, -32001, 'Session not found');
      return undefined;
    }
    armIdleTimeout(sessionId, session);
    return session;
  };

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/mcp', async (req, res) => {
    const sessionId = req.header('mcp-session-id');

    try {
      if (sessionId) {
        const session = getSession(sessionId, res);
        if (!session) return;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        sendProtocolError(res, 400, -32000, 'Bad Request: No valid session ID provided');
        return;
      }
      if (sessions.size + initializingSessions >= maxSessions) {
        sendProtocolError(res, 503, -32000, 'Server session capacity reached');
        return;
      }

      initializingSessions += 1;
      const server = createServer();
      let session: HttpSession;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: initializedSessionId => {
          sessions.set(initializedSessionId, session);
          armIdleTimeout(initializedSessionId, session);
        },
        onsessionclosed: closedSessionId => {
          removeSession(closedSessionId, session);
        },
      });
      session = { server, transport };
      transport.onclose = () => {
        if (transport.sessionId) removeSession(transport.sessionId, session);
      };

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        if (!transport.sessionId) await server.close();
      } catch (error) {
        if (transport.sessionId) removeSession(transport.sessionId, session);
        await server.close().catch(() => undefined);
        throw error;
      } finally {
        initializingSessions -= 1;
      }
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        sendProtocolError(res, 500, -32603, 'Internal server error');
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    const session = getSession(req.header('mcp-session-id'), res);
    if (!session) return;
    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling MCP stream:', error);
      if (!res.headersSent) sendProtocolError(res, 500, -32603, 'Internal server error');
    }
  });

  app.delete('/mcp', async (req, res) => {
    const session = getSession(req.header('mcp-session-id'), res);
    if (!session) return;
    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error closing MCP session:', error);
      if (!res.headersSent) sendProtocolError(res, 500, -32603, 'Internal server error');
    }
  });

  app.all('/mcp', (_req, res) => {
    res.setHeader('Allow', 'GET, POST, DELETE');
    sendProtocolError(res, 405, -32000, 'Method not allowed');
  });

  return app;
}

async function startStdioServer() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('Beautiful Solutions MCP Server running on stdio');
}

function startHttpServer() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const app = createHttpApp({ host: '0.0.0.0' });
  app.listen(port, '0.0.0.0', error => {
    if (error) throw error;
    console.error(`Beautiful Solutions MCP Server listening on port ${port}`);
  });
}

export async function main() {
  if (shouldUseHttpTransport()) {
    startHttpServer();
  } else {
    await startStdioServer();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(error => {
    console.error('Beautiful Solutions MCP failed to start:', error);
    process.exitCode = 1;
  });
}
