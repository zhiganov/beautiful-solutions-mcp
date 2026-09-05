# Book Power conformance review

Reviewed against the public **Build a book-powered MCP server or skill** spec,
revision `4db8fa448a740d6c83ec99dbc81b0daf3fbc8015`, on 2026-09-05.

Canonical spec:
https://gist.github.com/zhiganov/dfe35598ba30d0468f75c84e75c8c300

## Build inputs

| Input | Decision |
|---|---|
| Source | Official Beautiful Trouble English API and canonical online toolbox |
| Artifact | MCP server |
| Target users | Organizers, educators, facilitators, researchers, and community designers |
| Target work | Explore a live challenge through values, principles, questions, solutions, stories, and authored relationships |
| Rights | Public, open-license adaptation under CC BY-NC-SA 4.0; code separately MIT |
| Hosting | Local stdio only for version 0.1 |

## Conformance evidence

| Protocol requirement | Evidence | Result |
|---|---|---|
| Validate source extraction | `scripts/sync-source.mjs` validates official API records and writes an inventory and SHA-256 manifest. | Met |
| Classify the work before extraction | The shaping record identifies a primarily descriptive and dialectical toolbox, not a procedural recipe. | Met |
| Extract the practical method layer | `src/data/toolbox.json` retains concise source-authored snapshots and structural metadata. Complete write-ups are excluded and canonical links support close reading. | Met |
| Use structured data | `src/types.ts` uses a source-native typed contract for the five toolbox categories, authors, references, and relationships. This is the guide's permitted specialization rather than a forced generic framework/workflow schema. | Met |
| Name tools around practitioner work | Challenge mapping, comparison, relationship traversal, and discussion design augment reference retrieval. | Met |
| Keep runtime deterministic | No LLM, embedding service, database, API key, or runtime network request is used. | Met |
| Support stdio first | `src/index.ts` uses `StdioServerTransport`; README includes local client configuration. | Met |
| Preserve citations and rights | Every result has an attribution envelope; `CONTENT-LICENSE.md`, `LICENSES.md`, and `NOTICE.md` separate content and code obligations. | Met |
| Avoid endorsement and replacement claims | README states that the project is independent and is an aid rather than a substitute for the source. | Met |
| Document install, examples, limits, and hosting | README covers all four and directs complete reading to canonical source pages. | Met |
| Smoke-test through MCP | `src/index.test.ts` initializes the server, lists all eight tools, and calls each through the MCP protocol. | Met |
| Ship catalog metadata | `book-power.json` records source, rights, visibility, practitioner value, installation, and endorsement status. | Met |

## Content-boundary review

The initial snapshot included approximately 349,000 characters of complete
entry write-ups. Although the source license permits qualifying noncommercial
adaptation with attribution and ShareAlike, carrying the complete online
toolbox was not aligned with Book Power's method-layer discipline. Schema
version 2 removes those write-ups. It retains approximately 13,500 characters
of concise source-authored snapshots plus attribution, people, references,
short quotations, relationships, sectors, and canonical URLs.

This boundary is enforced in three places:

- the sync script does not ingest the source `write_up` field;
- tests reject `body` and `write_up` fields in the tracked dataset; and
- `get_entry` explicitly tells clients to use the canonical URL for complete
  reading.

## Remaining product validation

Protocol conformance does not establish practitioner usefulness. A separate
acceptance test should exercise challenge exploration, model comparison, and
discussion-guide preparation with realistic user prompts.
