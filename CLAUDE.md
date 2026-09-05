# CLAUDE.md

## Overview

`beautiful-solutions-mcp` exposes the structure and content of **Beautiful
Solutions: A Toolbox for Liberation** as deterministic MCP tools for
organizers, educators, facilitators, researchers, and community designers.

## Commands

```bash
npm run sync-source  # refresh the English source snapshot from the official API
npm run build        # compile TypeScript and copy source data to dist
npm test             # build and run focused tests
npm start            # run the stdio MCP server
```

## Architecture

```text
src/
  index.ts            MCP server and eight tool registrations
  toolbox.ts          data loading, retrieval, maps, and guide scaffolds
  search.ts           deterministic weighted text search
  types.ts            source and response types
  data/
    toolbox.json      tracked adapted snapshot of 85 English entries
    source-manifest.json
scripts/
  sync-source.mjs     official API ingestion and validation
  copy-data.mjs       copies runtime JSON into dist
  extract-method-cards.mjs
                       optional build-time GPT extraction, verification,
                       adjudication, and bounded regeneration
evaluation/
  method-card-pilot-labels.json
                       source-derived manual sentinel decisions
```

No LLM, database, vector store, or network call is used at runtime. The
official Beautiful Trouble API is contacted only by the explicit source-sync
script. The optional method-card extraction script uses OpenAI only at build
time and writes generated artifacts under ignored `.source-cache/`; it does
not change the deterministic runtime boundary.

## Source and licensing

The written toolbox is marked CC BY-NC-SA 4.0 by Beautiful Trouble. Read
`CONTENT-LICENSE.md` and `NOTICE.md`. Code is MIT; adapted content and
source-grounded output templates are CC BY-NC-SA 4.0. Never bundle source
images or imply endorsement.
