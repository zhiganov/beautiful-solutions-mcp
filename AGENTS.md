# Project instructions

Read `CLAUDE.md`, `docs/shaping/2026-09-05-beautiful-solutions-mcp.md`,
`CONTENT-LICENSE.md`, and `NOTICE.md` before changing source data or tools.

- Keep tool outputs source-grounded and preserve per-entry authors and URLs.
- Do not invent case details, outcomes, recommendations, or endorsements.
- Keep runtime deterministic: no LLM calls and no live web dependency.
- Do not bundle images; image rights may differ from the written toolbox.
- Keep code and content licensing distinct.
- Any content adaptation remains CC BY-NC-SA 4.0 and must retain attribution,
  license, and change notices.
- Run `npm test` after code or data changes.
