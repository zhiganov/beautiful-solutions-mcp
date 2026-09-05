# Beautiful Solutions MCP Server

An independent, source-grounded MCP server for exploring **Beautiful
Solutions: A Toolbox for Liberation**.

The server turns the online toolbox's connected values, principles, questions,
solutions, and stories into eight deterministic tools for organizers,
educators, facilitators, researchers, and community designers. It makes no LLM
or network calls at runtime.

## What is included

- 85 English toolbox entries
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
| `get_entry` | Read a complete entry with provenance and relationships |
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

## Install and run

Requirements: Node.js 20 or later.

```bash
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

## Development

```bash
npm run sync-source  # refresh from the official English API
npm test             # compile and run focused data, search, and MCP tests
```

The explicit sync script:

- selects entries whose official API type begins with `bsol-`;
- validates and reshapes source fields;
- excludes images and image captions;
- writes `src/data/toolbox.json` and a source manifest with a SHA-256 hash.

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
book's editors or contributors.

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
