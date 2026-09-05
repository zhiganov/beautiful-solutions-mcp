# Beautiful Solutions MCP — shaping

## Frame

The online toolbox contains a rich web of values, principles, questions,
solutions, and stories, but an AI user needs more than a bag of excerpts. The
MCP should preserve the source's relationships and help a practitioner move
from a live challenge to grounded examples and useful questions without
turning situated stories into universal prescriptions.

## Requirements

| ID | Requirement |
|---|---|
| R0 | Help organizers, educators, facilitators, researchers, and community designers explore solidarity-economy possibilities for a real challenge. |
| R1 | Preserve source fidelity: title, type, sector, text, authors, further reading, relationships, and canonical URL. |
| R2 | Let the toolbox's five-part structure—values, principles, questions, solutions, stories—drive navigation and outputs. |
| R3 | Support discovery, close reading, source-authored connection tracing, comparison, challenge mapping, and discussion design. |
| R4 | Keep results deterministic and inspectable; the conversational model does synthesis, while the server retrieves and assembles source evidence. |
| R5 | Comply with CC BY-NC-SA 4.0: attribution, license link, change notice, ShareAlike, NonCommercial restriction, and no implied endorsement. |
| R6 | Exclude images and avoid unsupported claims, outcome guarantees, or decontextualized recommendations. |
| R7 | Work locally over stdio with no database, API key, or runtime network dependency. |

## Selected shape: static source graph

Build a versioned English snapshot from Beautiful Trouble's official API. A
small weighted search layer and the source-authored relationship graph power
eight MCP tools. Praxis tools assemble evidence and prompts but do not write
new factual claims about the examples.

### Parts

| Part | Mechanism | Requirements |
|---|---|---|
| P1. Source snapshot | Explicit sync script validates all official `bsol-` entries and writes a manifest with source URLs and hashes. | R1, R5, R6, R7 |
| P2. Catalog index | Normalized types, sectors, summaries, full text, people, references, and related-entry edges. | R1, R2 |
| P3. Reference tools | Search, list, retrieve, and follow source-authored relationships. | R1, R2, R3 |
| P4. Praxis tools | Map a challenge across source types, compare selected entries, and generate a discussion scaffold. | R2, R3, R4, R6 |
| P5. Attribution envelope | Every result includes concise source, license, and adaptation metadata. | R5 |
| P6. Stdio package | TypeScript MCP server, focused tests, install and use documentation. | R4, R7 |

## Tool catalog

| Tool | Practitioner job | Output boundary |
|---|---|---|
| `search_toolbox` | Find relevant material by phrase, type, or sector. | Ranked source excerpts with transparent match scores. |
| `list_entries` | Browse the catalog without knowing search terms. | Compact entries filtered by source type or sector. |
| `get_entry` | Read one source entry closely. | Full adapted text, authors, references, relationships, and source URL. |
| `get_related_entries` | Follow the toolbox's own conceptual graph. | Only relationships supplied by the source API. |
| `map_challenge` | See a challenge through multiple toolbox lenses. | Ranked questions, values, principles, solutions, and stories; relevance is lexical, not a recommendation. |
| `compare_entries` | Put several models or stories side by side. | Source fields and relationship counts, with no invented evaluation. |
| `build_discussion_guide` | Prepare a class, book club, or community discussion. | A generated scaffold anchored to selected entries and their source-linked questions and values. |
| `get_source_info` | Inspect provenance and reuse conditions. | Book metadata, source inventory, license, changes, and limitations. |

## Fit checks

| Scenario | Expected fit |
|---|---|
| A housing organizer asks about collective ownership. | `map_challenge` surfaces Community Land Trust and related values/stories with source URLs; it does not promise local applicability. |
| An educator plans a session around two cases. | `get_entry` plus `build_discussion_guide` produces attributed readings and transferable discussion prompts. |
| A researcher wants to inspect relationships. | `get_related_entries` returns exactly the source-authored graph, grouped by toolbox type. |
| A user asks which model is best. | `compare_entries` exposes evidence; the conversational model must discuss tradeoffs and missing local context. |
| A commercial product wants to embed the corpus. | Documentation clearly flags that CC BY-NC-SA 4.0 prohibits commercial use without separate permission. |

## Out of scope for V1

- Images, translated editions, live website search, user accounts, favorites,
  analytics, vector embeddings, LLM-generated recommendations, and hosted
  deployment.
- Legal advice about whether a specific use is NonCommercial.
