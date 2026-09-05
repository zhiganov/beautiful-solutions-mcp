# Beautiful Solutions MCP Server

An independent, source-grounded MCP server for exploring **Beautiful
Solutions: A Toolbox for Liberation**.

The server turns the online toolbox's connected values, principles, questions,
solutions, and stories into eight deterministic tools for organizers,
educators, facilitators, researchers, and community designers. It makes no LLM
or network calls at runtime.

## What is included

- Concise source-authored summaries and structural metadata for 85 English toolbox entries
- 8 values
- 10 principles
- 8 questions
- 27 solutions
- 32 stories
- 12 source sectors
- Source-authored relationships between entries
- Per-entry authors, further reading, and canonical source URLs where supplied

Images are deliberately excluded because individual image permissions may
differ from the written toolbox license.

## Tools

| Tool | Use |
|---|---|
| `search_toolbox` | Search by challenge, phrase, person, type, or sector |
| `list_entries` | Browse compact entries by source type or sector |
| `get_entry` | Inspect a source-authored summary, provenance, relationships, and the canonical link for complete reading |
| `get_related_entries` | Follow relationships supplied by the source toolbox |
| `map_challenge` | Surface questions, values, principles, solutions, and stories around a challenge |
| `compare_entries` | Put two to six entries side by side without ranking them |
| `build_discussion_guide` | Assemble an attributed discussion scaffold from selected entries |
| `get_source_info` | Inspect inventory, provenance, license, changes, and snapshot integrity |

Every tool result includes a concise attribution and license envelope.
Challenge maps disclose their lexical/relational ranking method and are
explicitly exploration leads—not recommendations.

## Example uses

**Explore community-controlled housing**

> Map community ownership of housing and land across the Beautiful Solutions
> questions, values, principles, solutions, and stories.

The client can call `map_challenge`, then use `get_entry` and
`get_related_entries` to inspect Community Land Trusts and connected material.

**Prepare a community discussion**

> Build a discussion for a neighborhood housing coalition using Community Land
> Trusts and Limited-Equity Housing Cooperatives.

The client can call `build_discussion_guide` with the corresponding IDs. The
result labels generated prompts separately from source text.

**Compare without declaring a winner**

> Compare participatory budgeting and community land trusts. Show what the
> source says and what local information we would still need.

`compare_entries` provides source fields; the conversational model handles the
contextual analysis.

## Extraction discipline

This work is primarily **descriptive and dialectical**, not procedural. It
presents situated examples alongside values, principles, and open questions;
it does not prescribe one sequence or universal answer. The MCP therefore
preserves the source's five-part structure and authored relationships while
keeping challenge matches explicitly non-recommendatory.

The tracked dataset is a method-layer index, not a copy of the online toolbox.
It retains concise source-authored snapshots, attribution, references, and
relationships but excludes complete entry write-ups. Each record links to its
canonical Beautiful Trouble page for close reading. This tool is an aid for
finding and discussing the work, not a replacement for the book or online
toolbox.

## Install and run

Requirements: Node.js 20 or later.

```bash
git clone https://github.com/zhiganov/beautiful-solutions-mcp.git
cd beautiful-solutions-mcp
npm install
npm run build
```

Run the stdio server:

```bash
npm start
```

Or configure Claude Code from this checkout:

```bash
claude mcp add-json beautiful-solutions \
  '{"type":"stdio","command":"node","args":["/absolute/path/to/beautiful-solutions-mcp/dist/index.js"]}' \
  -s local
```

No API key, database, or live web connection is required at runtime.

Version 0.1 uses local stdio only. It is not currently offered as a hosted
service. Anyone considering redistribution or hosting should review the
NonCommercial and ShareAlike conditions described below.

## Development

```bash
npm run sync-source  # refresh from the official English API
npm run extract:pilot # run the optional five-entry build-time extraction pilot
npm test             # compile and run focused data, search, and MCP tests
```

The extraction pilot is development tooling, not part of the MCP runtime. It
requires `OPENAI_API_KEY` in the process environment, the sibling Book Power
repo's ignored `.env`, or this repo's ignored `.private/openai.env`; the
optional `OPENAI_EXTRACTION_MODEL` defaults to `gpt-5-mini`, while
`OPENAI_VERIFICATION_MODEL` defaults to the distinct `gpt-5.4-mini`. It writes
resumable caches and method cards only under ignored `.source-cache/`. The
verifier records support, reclassification, removal, and deduplication
decisions without rewriting candidate claims. The five-entry calibrated pilot
is accepted for bounded full-corpus extraction; runtime integration remains a
separate gate. See
[`docs/reviews/2026-09-05-gpt-extraction-pilot.md`](docs/reviews/2026-09-05-gpt-extraction-pilot.md).

The explicit sync script:

- selects entries whose official API type begins with `bsol-`;
- validates and reshapes source fields;
- writes complete text to the ignored `.source-cache/` directory for
  build-time analysis;
- retains concise source-authored snapshots, repairs source line-break
  hyphenation in runtime text, and excludes complete write-ups from runtime
  data;
- excludes images and image captions;
- writes `src/data/toolbox.json` and a source manifest with a SHA-256 hash.

The source cache is deliberately excluded from Git, the npm package, and MCP
runtime loading. It can support later method extraction, search evaluation, or
source-drift review without sending the full corpus to an MCP client. Running
`npm run sync-source` recreates it from the official API.

The runtime rechecks that hash through `get_source_info`. A matching hash shows
that the tracked snapshot has not changed since the manifest was written; it
does not independently prove the upstream source's authenticity.

## Source and attribution

**Beautiful Solutions: A Toolbox for Liberation** (2024), edited by Elandria
Williams, Rachel Plattus, Eli Feghali, and Nathan Schneider, with more than 70
contributors. Created in partnership with Beautiful Trouble, New Economy
Coalition, People's Hub, and Highlander Center.

- [Online toolbox](https://beautifultrouble.org/toolbox/bsol)
- [Book page and publication details](https://beautifultrouble.org/store/p/beautiful-solutions)
- [Launch announcement](https://beautifultrouble.org/dispatches/-beautiful-solutions-a-toolbox-for-liberation-is-here-)

This independent adaptation is not endorsed by Beautiful Trouble or the
book's editors or contributors. It is a source-backed aid, not a substitute
for reading the source work.

## License and reuse boundary

Beautiful Trouble's site states that the written toolbox is licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The
adapted data and source-grounded output templates in this repository use that
same license. It requires attribution and ShareAlike and prohibits commercial
use without separate permission.

The software code is separately available under the MIT License. See
`LICENSES.md`, `CONTENT-LICENSE.md`, and `NOTICE.md` before redistributing, hosting, or
integrating the content. Determining whether a particular use is
NonCommercial may require advice or permission from the rights holder.

## Book Power compatibility

`book-power.json` records the source, rights status, practitioner job, local
stdio command, and non-endorsement status in the Book Power submission format.
To propose this artifact for the catalog, use the submission form at
[bookpower.org/build#submit](https://bookpower.org/build#submit). Include the
repository link and confirm the CC BY-NC-SA 4.0 rights boundary.
