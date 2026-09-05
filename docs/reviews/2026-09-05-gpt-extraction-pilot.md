# GPT method-card extraction pilot

## Verdict

**Not accepted for full-corpus extraction.** GPT-5 Mini produced substantially
better method depth than GPT-5 Nano, and the final five cards passed structural
and exact-citation gates. Manual review still found two taxonomy errors that
would mislead application: Social Cooperatives treated government-contract
revenue as an implementation constraint even though the source states it as a
fact, and Artist and Freelancer Co-ops treated the precarious work the model
responds to as a constraint on the model.

The next gate is an independent semantic verification pass that can reject or
reclassify claims whose evidence exists but does not support the assigned
field. Do not process all 85 entries until the same five cards pass that gate.

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
| Semantic field fidelity | **Fail** | Two of five final cards misclassified problem or funding context as implementation constraints. |
| Full-corpus readiness | **Fail** | Mechanical citation checks cannot prove that cited evidence entails a generated claim or that its category is correct. |

## Usage accounting note

The ignored cache contains 43,151 tokens of captured development calls across
the Nano and Mini comparisons. Six earlier rejected Nano attempts used an
initial harness revision that did not persist response usage, so cumulative
pilot usage cannot be reconstructed exactly. The final Mini run's 19,086-token
measurement is complete. No cost estimate is asserted here.

## Required next experiment

Add a separate strict-schema verification pass over each candidate card and
its numbered source sentences. The verifier must classify every item as
supported in its assigned field, supported but misclassified, or unsupported;
it must not rewrite claims silently. Reclassifications and removals should be
recorded as adaptation changes. Rerun these five entries, manually inspect the
verifier's decisions, and only then decide whether to process the 85-entry
corpus.
