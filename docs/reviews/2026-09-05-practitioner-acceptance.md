# Practitioner acceptance review

Reviewed commit `1e11800` on 2026-09-05 through an in-memory MCP client using
the same protocol boundary as a desktop client. The review exercised challenge
exploration, close inspection, comparison, and discussion preparation. It also
probed two additional domains and three plain-language searches.

## Acceptance criteria

| Criterion | Question |
|---|---|
| Retrieval relevance | Do the leading entries address the practitioner's stated challenge? |
| Actionable depth | Does the result contain enough source-grounded substance to support the next piece of work? |
| Source fidelity | Are source categories, authors, relationships, and claims preserved without invention? |
| Provenance | Can a practitioner identify and reach the source? |
| Epistemic boundary | Does the tool distinguish relevance from recommendation and source text from generated scaffolding? |
| Tool usability | Are prompts and outputs coherent without repair by the client model? |

## Scenario A: explore permanently affordable resident-controlled housing

**Prompt:** A neighborhood coalition wants to keep housing permanently
affordable, prevent displacement, and give residents control over land and
decisions.

**Calls:** `map_challenge`, then `get_entry` on the leading solution.

**What worked**

- The leading solutions were Community Land Trust and Limited-Equity Housing
  Cooperatives.
- Democratize Ownership was the leading principle and Democratic
  Participation was the leading value.
- `get_entry` preserved authors, short quotations, references, authored
  relationships, attribution, and the canonical source URL.
- The result clearly described challenge matches as exploration leads rather
  than recommendations.

**What failed**

- The leading question concerned borders drawn by colonialism and empire. It
  shared source relationships and a broad enclosure theme but did not directly
  help the stated housing decision.
- Sustainable Resources Management in Nepal appeared among the three leading
  stories despite lacking a direct housing fit.
- The entry summary defines a community land trust but does not expose the
  mechanism, enabling conditions, governance choices, limitations, or
  transfer risks needed to apply the example.

**Verdict:** Relevant entry discovery works for the strongest literal matches,
but graph expansion introduces weak cross-domain results and the summary layer
is too shallow for application.

## Scenario B: compare two housing approaches

**Prompt:** Compare Community Land Trusts and Limited-Equity Housing
Cooperatives for the coalition without declaring a winner.

**Call:** `compare_entries` with the two source IDs.

**What worked**

- Both requested entries were returned with definitions, source links, short
  quotations, references, and relationship counts.
- The output correctly declined to rank the approaches.

**What failed**

- The matrix did not identify the source-grounded dimensions a practitioner
  needs: what is collectively owned, how control is exercised, how permanent
  affordability is maintained, enabling conditions, known constraints, or
  contextual differences.
- Relationship counts are structurally accurate but not meaningful comparison
  evidence by themselves.

**Verdict:** The tool performs juxtaposition, not a useful source-grounded
comparison. This is a material depth failure.

## Scenario C: prepare a coalition discussion

**Prompt:** Build a discussion for a neighborhood coalition deciding how to
secure permanently affordable, resident-governed housing using the same two
approaches.

**Call:** `build_discussion_guide`.

**What worked**

- The five-phase flow moves from context and affected knowledge through close
  reading, transfer risks, toolbox lenses, and a reversible learning step.
- Generated prompts are clearly separated from quotations.
- Reading records retain attribution and canonical links.

**What failed**

- The generated sentence began, “What does the a neighborhood coalition…”, a
  deterministic grammar defect caused by inserting an already-articled
  context after the fixed word “the.”
- The only source-linked question concerned colonial borders and was weakly
  relevant to the housing decision.
- No source-linked values were returned even though values are part of the
  intended five-lens experience.
- The guide asks participants to examine conditions, relationships, and power
  shifts but does not provide source-grounded material about those dimensions.

**Verdict:** The generic facilitation sequence is useful, but weak source
selection and insufficient reading depth prevent the guide from standing on
its own.

## Additional retrieval probes

The same failure generalized beyond housing:

- A gig-worker challenge returned Community Land Trust and Limited-Equity
  Housing Cooperatives as the leading solutions.
- A community-controlled renewable-energy challenge returned Community Land
  Trust as the leading solution and Community Broadband Networks second.
- Plain-language search for “community solar power” returned broadband, land
  trusts, community safety, and sports teams in the first five results.

The immediate cause is deterministic: `relatedBoostIds` adds score even when a
candidate has no lexical match. A relationship alone can therefore admit and
rank an otherwise unrelated entry. Removing complete write-ups also reduced
the searchable vocabulary to short snapshots, making plain-language recall
more brittle.

## Findings

| Priority | Finding | Consequence |
|---|---|---|
| P0 | Relationship boost creates candidates without a lexical match. | Challenge maps leak strongly connected but irrelevant entries across domains. |
| P0 | Source snapshots do not carry enough method depth for comparison or application. | The client must fetch the original pages or invent missing dimensions. |
| P1 | Discussion context is inserted after an unconditional “the.” | Common natural-language contexts produce broken prompts. |
| P1 | Discussion lenses inherit source relationships without testing contextual relevance. | Guides can foreground unrelated questions and return no values. |
| P1 | Source snapshots retain line-break hyphenation such as “hous- ing.” | Results look mechanically extracted and search tokens split incorrectly. |

## Recommendation

Do not add vector embeddings first. Fix the deterministic relevance and prompt
defects because they would also contaminate an embedding-backed system. Then
use the established Book Power build-time Sonnet pattern over
`.source-cache/toolbox-full.json` to extract concise, cited method cards for
each solution and story. Useful fields should be justified by the source and
may include mechanism, actors, ownership or governance form, enabling
conditions, tensions or limitations, transfer questions, and source location.

Keep runtime retrieval static and offline. Re-run these scenarios after the
method cards exist; consider vector retrieval only if realistic language still
fails against the richer structured catalog.

## Overall result

**Not accepted for practitioner application.** Provenance, attribution,
source fidelity, and epistemic boundaries are strong. Literal discovery is
promising. Cross-domain relevance, comparison depth, and discussion-guide
grounding need correction before a release claim.
