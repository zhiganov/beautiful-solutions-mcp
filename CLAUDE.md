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
npm start            # run stdio, or HTTP when MCP_TRANSPORT=http / on Railway
npm run extract:pilot # run the calibrated five-entry build-time pilot
npm run extract:full  # extract and verify all 85 entries for corpus review
npm run audit:cards   # validate the full artifact and write the review worksheet
npm run integrate:cards # write manually accepted cards into tracked runtime data
```

## Architecture

```text
src/
  index.ts            MCP server, eight tool registrations, and stdio/HTTP transports
  toolbox.ts          data loading, retrieval, maps, and guide scaffolds
  search.ts           deterministic weighted text search
  types.ts            source and response types
  data/
    toolbox.json      tracked adapted snapshot of 85 English entries
    source-manifest.json
    method-cards.json tracked accepted cards without complete write-ups or
                      build-time verification quotations
    method-card-manifest.json
                      integrity metadata for method-cards.json
scripts/
  sync-source.mjs     official API ingestion and validation
  copy-data.mjs       copies runtime JSON into dist
  extract-method-cards.mjs
                        optional build-time GPT extraction, verification,
                        adjudication, and bounded regeneration
  audit-method-card-corpus.mjs
                        validates the ignored full artifact and writes an
                        ignored item-by-item review worksheet
  integrate-method-cards.mjs
                        admits only hash-bound accepted cards into runtime data
evaluation/
  method-card-pilot-labels.json
                        source-derived manual sentinel decisions
  method-card-corpus-overrides.json
                        fingerprinted full-corpus human decisions with complete
                        candidate identity and evidence, plus explicit
                        source-grounded summary replacements; these take
                        precedence over verifier disagreements
  method-card-corpus-acceptance.json
                        manual acceptance bound to all 85 final-card hashes
```

No LLM, database, vector store, or outbound network call is used at runtime. The
official Beautiful Trouble API is contacted only by the explicit source-sync
script. The optional method-card extraction script uses OpenAI only at build
time and writes generated artifacts under ignored `.source-cache/`; it does
not change the deterministic runtime boundary.

The default transport is local stdio. `MCP_TRANSPORT=http` or Railway starts a
public Streamable HTTP server with `/health` and `/mcp`; sessions are held in
memory, capped at 100, and closed after 30 minutes without a request.

## Source and licensing

The written toolbox is marked CC BY-NC-SA 4.0 by Beautiful Trouble. Read
`CONTENT-LICENSE.md` and `NOTICE.md`. Code is MIT; adapted content and
source-grounded output templates are CC BY-NC-SA 4.0. Never bundle source
images or imply endorsement.
