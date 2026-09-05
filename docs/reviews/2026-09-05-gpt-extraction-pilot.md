# GPT method-card extraction pilot

## Verdict

**Accepted as the calibration basis for a full-corpus extractor, but not yet
implemented for all 85 entries or integrated into runtime tools.** GPT-5 Mini
produced substantially better method depth than GPT-5 Nano, and all five
candidate cards passed structural and exact-citation gates. The final pilot
pipeline combines a distinct GPT-5.4 Mini semantic verifier, 18 source-derived
manual sentinel labels, deterministic human overrides, and bounded
verifier-feedback regeneration. All five cards passed after manual item-level
review.

The gate worked rather than merely becoming permissive. Community Land Trust
required one replacement card after its original one-sentence description was
rejected. Remunicipalization required two replacements: the first still had an
unsupported actor premise in a transfer question, while the second initially
retained two inferred enabling conditions that the manual labels removed. The
pipeline preserves every candidate, verifier decision, override, regenerated
card, and subsequent verification in ignored build artifacts. Processing all 85
entries is now the next implementation step, not a command this pilot script
already exposes. Adding resulting cards to runtime tools still requires
separate practitioner acceptance.

## Scope and boundaries

The pilot used five entries selected to cover the failed practitioner
scenarios and more than one source type:

- Community Land Trust
- Limited-Equity Housing Cooperatives
- Social Cooperatives
- Remunicipalization
- Artist and Freelancer Co-ops in Europe

The source was the ignored complete-text snapshot with SHA-256
`b7e730dc309483190b68c1980ba994966c0127520d679c7e06ca8b81f72b9163`.
No source images were sent or stored. Generated cards and response caches stay
under ignored `.source-cache/`; no generated field was added to tracked
runtime data, MCP outputs, or the npm package.

The harness uses OpenAI's Responses API with strict JSON Schema Structured
Outputs. It numbers source sentences before each request, asks the model to
cite sentence IDs, resolves those IDs back to source-exact text, and rejects
unknown IDs. This replaced an unreliable first design that asked the model to
copy quotations verbatim.

## Model comparison

### GPT-5 Nano

The complete Nano comparison generated structurally valid cards for all five
entries and used 13,204 captured tokens. Its cards were consistently shallow,
and manual review found unsupported interpretation in every entry: inferred
tensions, meta-level purposes such as what the entry “describes,” generalized
case outcomes, or generated questions with citation syntax in prose.

A stricter prompt was retested on Social Cooperatives. It needed two attempts
and 4,800 captured tokens, but still turned reliance on government contracts
into an unsupported claim about sustainability and generated a grammatical
error. Nano therefore failed the source-fidelity and practitioner-depth gate.

### GPT-5 Mini

Mini produced richer mechanisms, actor roles, enabling conditions, and inquiry
questions. After the schema separated motivating problem context from
implementation constraints, all five final cards passed the mechanical gates
on their first attempt.

Final run measurements:

| Measure | Result |
|---|---:|
| Entries | 5 |
| First-attempt structural passes | 5 |
| Input tokens | 10,353 |
| Output tokens | 8,733 |
| Total tokens | 19,086 |
| Evidence-quote references resolved exactly | 310 |
| Mechanisms | 18 |
| Problem-context claims | 12 |
| Enabling conditions | 14 |
| Constraints | 11 |
| Explicit tensions | 0 |
| Transfer questions | 16 |
| Search concepts | 25 |

Leaving the tension arrays empty was correct under the source boundary: the
selected entries did not consistently state explicit tradeoffs, and the
harness instructs the model not to manufacture them by juxtaposing facts.

## Acceptance checks

| Check | Result | Evidence |
|---|---|---|
| Strict schema adherence | Pass | All five Mini responses parsed against the same closed JSON schema. |
| Existing citation IDs only | Pass | Unknown sentence IDs are rejected before materialization. |
| Exact source evidence | Pass | All 310 evidence references resolved to text for which the source body contains the exact substring. |
| Source/runtime separation | Pass | Inputs and outputs remain in ignored build-time directories; runtime code and tracked content are unchanged. |
| No forced tension filling | Pass | Empty tension arrays were retained. |
| Method depth | Pass with caveat | Mini extracted concrete mechanisms, actors, finance/legal conditions, and inquiry prompts, but these have not yet been exercised through MCP tools. |
| Semantic field fidelity | Pass with adjudication | The distinct verifier matched 15 of 18 applicable sentinel decisions; three disagreements were resolved by recorded human labels rather than silent rewriting. |
| Regeneration completeness | Pass | Community Land Trust passed after one replacement; Remunicipalization passed after two, with cumulative feedback preventing rejected ideas from reappearing. |
| Manual method-card review | Pass | All five final cards retain concrete mechanisms, actors, conditions or constraints, observable signals, at least two transfer questions, and at least three search concepts. |
| Pilot prerequisite for full-corpus work | **Pass** | The five-entry calibration gate passed. A full-corpus command, corpus-level review, runtime integration, and practitioner scenario acceptance remain to be implemented. |

## Semantic-verifier experiment

The first independent request pass used the same `gpt-5-mini` model as the
extractor. It classified every candidate item without rewriting claims,
correctly reclassified the Social Cooperatives government-contract item and
the Artist and Freelancer Co-ops precarity item, and exposed a deterministic
application issue: moving the government-contract claim duplicated an existing
enabling condition. The application layer now removes reclassified duplicates
when their exact evidence set is already present and records the deduplication.

Manual review found correlated false approvals. The verifier accepted inferred
government support as a land-trust enabling condition and inferred municipal
legal capacity as a remunicipalization enabling condition. Extraction and
verification were therefore separated: `gpt-5-mini` remains the candidate
extractor and `gpt-5.4-mini` is the default verifier.

The distinct verifier removed two Community Land Trust items: the inferred
government-support condition and a transfer question that introduced
homeowner wealth-building, which the source does not mention. On
Remunicipalization it removed seven items, including both inferred enabling
conditions and two transfer questions with unsupported premises. Only one
transfer question remained, so the card failed the minimum application-depth
gate. The harness now stops immediately in that state rather than retrying a
verifier that cannot create replacements.

The verifier also produced at least one conservative false negative: it
removed the mechanism describing contract termination and return to public
management even though those elements are supported across separate source
sentences. Verification therefore improves precision but is not yet a
calibrated judge. Manual labels for these five entries are still required.

## Calibrated regeneration result

The tracked fixture at `evaluation/method-card-pilot-labels.json` contains 18
manual sentinel decisions tied to the source snapshot hash, candidate prompt
version, extraction model, item ID, and a fingerprint of the complete item
including rationale and evidence sentence IDs. Labels that do not match the
exact item version are reported as not applicable rather than being applied to
a different item occupying the same array position. The pilot exits nonzero
unless every expected label applies somewhere in the preserved candidate
chain; a fresh model response cannot bypass calibration by changing its words.

Across the final run's candidate versions, all 18 labels were applicable. The
verifier matched 15. Human adjudication overrode three decisions:

- Social Cooperatives: “reliance” on government contracts added an unstated
  dependency, so the constraint was removed rather than moved.
- Remunicipalization: examples of contract termination did not establish an
  enabling legal framework.
- Remunicipalization: one municipal-company example did not establish abstract
  municipal authority as an enabling condition.

Regeneration feedback is cumulative. This matters because the first
Remunicipalization replacement removed the initial unsupported questions, but
a later replacement repeated them when it received only the immediately prior
round's decisions. Carrying all earlier rejections into subsequent rounds
prevented that recurrence. The loop is bounded to two replacements; a card
that still fails after that exits nonzero.

Final reviewed-card inventory:

| Measure | Result |
|---|---:|
| Accepted entries | 5/5 |
| Manual sentinel decisions | 18 |
| Sentinel coverage across preserved candidate chains | 18/18 |
| Verifier agreements | 15 |
| Recorded human overrides | 3 across 2 entries |
| Mechanisms | 21 |
| Actors and roles | 19 |
| Enabling conditions | 10 |
| Constraints | 10 |
| Observable signals | 20 |
| Transfer questions | 11 |
| Search concepts | 24 |
| Source-exact evidence references retained | 271 |

## Usage accounting note

The extraction comparison used 43,151 captured tokens. The same-model
verification comparison used 36,426, and the bounded distinct-verifier tests
used 26,897. Calibration and regeneration development added 80,021 captured
tokens, for 186,495 captured development tokens overall. Six earlier rejected
Nano attempts used an initial harness revision that did not persist response
usage, so cumulative pilot usage cannot be reconstructed exactly. Attempt logs
use unique filenames so a rerun cannot overwrite prior usage or rejection
evidence. No cost estimate is asserted here.

## Next gate

Implement a separate full-corpus mode that applies extraction, verification,
and bounded regeneration across all 85 entries without pretending the 18
pilot labels cover unseen cards. Review the resulting corpus for new semantic
failure classes before adding method cards to tracked runtime data. Then rerun
the plain-language housing, gig-worker, and renewable-energy practitioner
scenarios through the actual MCP tools; pilot-card quality does not prove
runtime retrieval or comparison quality.
