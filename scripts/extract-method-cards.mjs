import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, '.source-cache/toolbox-full.json');
const calibrationPath = resolve(projectRoot, 'evaluation/method-card-pilot-labels.json');
const cacheDir = resolve(projectRoot, '.source-cache/extraction-cache');
const verificationCacheDir = resolve(projectRoot, '.source-cache/verification-cache');
const pilotOutputPath = resolve(projectRoot, '.source-cache/method-cards-pilot.json');
const apiUrl = 'https://api.openai.com/v1/responses';
const promptVersion = 'method-card-v4-problem-context';
const verificationPromptVersion = 'method-card-verifier-v3-cross-sentence-calibration';
const regenerationPromptVersion = 'method-card-regeneration-v1';
const defaultModel = 'gpt-5-mini';
const defaultVerificationModel = 'gpt-5.4-mini';
const maxRegenerationRounds = 2;
const movableClaimFields = [
  'purposes',
  'problemContext',
  'mechanisms',
  'enablingConditions',
  'constraints',
  'tensions',
  'observableSignals',
];
const cardFields = [
  'oneSentence',
  ...movableClaimFields,
  'actorsAndRoles',
  'transferQuestions',
  'searchConcepts',
];
const pilotIds = [
  'bsol-community-land-trust',
  'bsol-limited-equity-housing-cooperatives',
  'bsol-social-cooperatives',
  'bsol-remunicipalization',
  'bsol-artist-and-freelancer-co-ops-in-europe',
];

const evidenceClaimSchema = z.object({
  claim: z.string().trim().min(1),
  evidenceQuotes: z.array(z.string().min(1).max(600)).min(1).max(3),
}).strict();

const methodCardSchema = z.object({
  entryId: z.string().min(1),
  oneSentence: evidenceClaimSchema,
  purposes: z.array(evidenceClaimSchema).max(5),
  problemContext: z.array(evidenceClaimSchema).max(5),
  mechanisms: z.array(evidenceClaimSchema).max(8),
  actorsAndRoles: z.array(z.object({
    actor: z.string().trim().min(1),
    role: z.string().trim().min(1),
    evidenceQuotes: z.array(z.string().min(1).max(600)).min(1).max(3),
  }).strict()).max(8),
  enablingConditions: z.array(evidenceClaimSchema).max(8),
  constraints: z.array(evidenceClaimSchema).max(8),
  tensions: z.array(evidenceClaimSchema).max(8),
  observableSignals: z.array(evidenceClaimSchema).max(8),
  transferQuestions: z.array(z.object({
    question: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    evidenceQuotes: z.array(z.string().min(1).max(600)).min(1).max(3),
  }).strict()).max(8),
  searchConcepts: z.array(z.object({
    label: z.string().trim().min(1),
    evidenceQuotes: z.array(z.string().min(1).max(600)).min(1).max(2),
  }).strict()).max(15),
}).strict();

const verificationResultSchema = z.object({
  entryId: z.string().trim().min(1),
  decisions: z.array(z.object({
    itemId: z.string().trim().min(1),
    verdict: z.enum(['supported', 'misclassified', 'unsupported']),
    targetField: z.enum([...cardFields, 'remove']),
    rationale: z.string().trim().min(1),
    evidenceSentenceIds: z.array(z.string().length(4)).max(3),
  }).strict()).max(100),
}).strict();

const evidenceClaimJsonSchema = {
  type: 'object',
  properties: {
    claim: { type: 'string', minLength: 1 },
    evidenceSentenceIds: {
      type: 'array',
      items: { type: 'string', minLength: 4, maxLength: 4 },
      minItems: 1,
      maxItems: 3,
    },
  },
  required: ['claim', 'evidenceSentenceIds'],
  additionalProperties: false,
};

const methodCardJsonSchema = {
  type: 'object',
  properties: {
    entryId: { type: 'string', minLength: 1 },
    oneSentence: evidenceClaimJsonSchema,
    purposes: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 5 },
    problemContext: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 5 },
    mechanisms: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 8 },
    actorsAndRoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          actor: { type: 'string', minLength: 1 },
          role: { type: 'string', minLength: 1 },
          evidenceSentenceIds: {
            type: 'array',
            items: { type: 'string', minLength: 4, maxLength: 4 },
            minItems: 1,
            maxItems: 3,
          },
        },
        required: ['actor', 'role', 'evidenceSentenceIds'],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    enablingConditions: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 8 },
    constraints: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 8 },
    tensions: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 8 },
    observableSignals: { type: 'array', items: evidenceClaimJsonSchema, maxItems: 8 },
    transferQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', minLength: 1 },
          rationale: { type: 'string', minLength: 1 },
          evidenceSentenceIds: {
            type: 'array',
            items: { type: 'string', minLength: 4, maxLength: 4 },
            minItems: 1,
            maxItems: 3,
          },
        },
        required: ['question', 'rationale', 'evidenceSentenceIds'],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    searchConcepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1 },
          evidenceSentenceIds: {
            type: 'array',
            items: { type: 'string', minLength: 4, maxLength: 4 },
            minItems: 1,
            maxItems: 2,
          },
        },
        required: ['label', 'evidenceSentenceIds'],
        additionalProperties: false,
      },
      maxItems: 15,
    },
  },
  required: [
    'entryId',
    'oneSentence',
    'purposes',
    'problemContext',
    'mechanisms',
    'actorsAndRoles',
    'enablingConditions',
    'constraints',
    'tensions',
    'observableSignals',
    'transferQuestions',
    'searchConcepts',
  ],
  additionalProperties: false,
};

const verificationJsonSchema = {
  type: 'object',
  properties: {
    entryId: { type: 'string', minLength: 1 },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemId: { type: 'string', minLength: 1 },
          verdict: { type: 'string', enum: ['supported', 'misclassified', 'unsupported'] },
          targetField: { type: 'string', enum: [...cardFields, 'remove'] },
          rationale: { type: 'string', minLength: 1 },
          evidenceSentenceIds: {
            type: 'array',
            items: { type: 'string', minLength: 4, maxLength: 4 },
            maxItems: 3,
          },
        },
        required: ['itemId', 'verdict', 'targetField', 'rationale', 'evidenceSentenceIds'],
        additionalProperties: false,
      },
      maxItems: 100,
    },
  },
  required: ['entryId', 'decisions'],
  additionalProperties: false,
};

const instructions = `You extract a source-grounded method card from one entry in Beautiful Solutions: A Toolbox for Liberation.

Treat the source as descriptive and dialectical. Solutions and stories are situated possibilities, not universal instructions. Use only the supplied source body and metadata. Do not infer local applicability, causation, outcomes, recommendations, endorsements, or missing facts.

Every factual claim, role, rationale, and search concept must cite one to three sentence IDs from the numbered SOURCE SENTENCES. Cite only IDs that exist in the supplied source. If the source does not support a field, return an empty array rather than filling it generically.

Use these field boundaries:
- purposes: what the model, institution, or practice seeks to provide or change; never what the entry describes, documents, highlights, or illustrates.
- problemContext: harms, unmet needs, or historical conditions the source explicitly says the model or story responds to.
- mechanisms: arrangements or processes the source says make the model work.
- enablingConditions: resources, laws, relationships, or conditions the source explicitly says enable or support the model.
- constraints: only challenges, barriers, risks, limitations, or prerequisites to adopting, operating, or sustaining the model that are explicitly stated by the source. Put the problem the model responds to under problemContext, not constraints. Do not turn a source fact into a hypothetical constraint.
- tensions: only an explicit tradeoff, conflict, or competing pressure stated by the source. Do not infer a tension merely by juxtaposing two source facts; return an empty array when none is explicit.
- observableSignals: directly observable structures or practices described in the source. Do not invent a success indicator or generalize a reported case outcome into a metric.
- transferQuestions: original open questions for inquiry, never advice or a request for the “best” approach. The rationale must explain the source-grounded reason for asking without sentence IDs or citation syntax.
- searchConcepts: specific mechanisms, actors, institutional forms, conditions, or domains supported by the source, not broad promotional keywords.

Keep sentence IDs only in evidenceSentenceIds. Never put IDs, “groundedIn:”, or other citation syntax in claims, questions, rationales, roles, or labels.`;

const verificationInstructions = `You are an independent semantic verifier for a method card extracted from Beautiful Solutions: A Toolbox for Liberation.

Audit every supplied candidate item against the numbered source sentences. Do not rewrite any item. Return exactly one decision for each itemId and no additional itemIds.

Verdicts:
- supported: the source entails the item without adding causation, outcomes, applicability, recommendations, or certainty, and the item belongs in its current field. targetField must equal currentField.
- misclassified: the source entails the item, but it belongs in a different compatible field. targetField must name that field.
- unsupported: the source does not entail the item, it materially overgeneralizes the evidence, or no compatible field fits. targetField must be remove.

Field boundaries:
- purposes: what the model, institution, or practice seeks to provide or change.
- problemContext: harms, unmet needs, or historical conditions the model or story responds to.
- mechanisms: arrangements or processes the source says make the model work.
- enablingConditions: resources, laws, relationships, or conditions the source explicitly says enable or support the model.
- constraints: explicit challenges, barriers, risks, limitations, or prerequisites to adopting, operating, or sustaining the model; never merely the problem it responds to.
- tensions: explicit tradeoffs, conflicts, or competing pressures; do not infer a tension by juxtaposing facts.
- observableSignals: directly observable structures or practices, not invented success metrics or generalized case outcomes.
- actorsAndRoles: actors and roles directly supported by the source.
- transferQuestions: generated inquiry questions are acceptable only when open, non-advisory, and free of unsupported factual premises; the rationale must accurately describe why the cited source motivates the question.
- searchConcepts: source-supported mechanisms, actors, institutional forms, conditions, or domains.

The oneSentence item cannot be reclassified. actorsAndRoles, transferQuestions, and searchConcepts can only remain in their current field or be removed. The seven claim-list fields may be reclassified only among those seven fields. Cite one to three source sentence IDs for supported or misclassified decisions. An unsupported decision may have an empty evidenceSentenceIds array. Judge semantic entailment and category fit, not merely whether the cited words occur.

Apply these calibration rules strictly:
- Every material clause in a composite item must be entailed; one supported clause does not rescue an unsupported clause.
- Evaluate the item against the entire source, not only its candidate evidence IDs. A claim may be supported across several source sentences; cite the best combined evidence rather than rejecting a valid cross-sentence synthesis.
- An example of a government or organization using a model does not by itself establish that its “support,” “capacity,” or “political will” is an enabling condition.
- Community governance of an asset owned by one nonprofit does not by itself establish “shared ownership”; if the source separates land ownership from building ownership, preserve that distinction.
- One actor occupying several roles does not establish separate stakeholder groups or competing interests among those roles.
- Preserve attribution when a claim depends on a named speaker's comparative or outcome assertion; otherwise mark the generalized claim unsupported.
- If your rationale needs words such as “implies,” “suggests,” or “indicates” to bridge source evidence to a factual item, the item is not supported. Transfer questions may inquire beyond the source, but their premises must still be entailed.`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function loadEnvFile() {
  const allowedKeys = new Set([
    'OPENAI_API_KEY',
    'OPENAI_EXTRACTION_MODEL',
    'OPENAI_VERIFICATION_MODEL',
  ]);
  const envPaths = [
    resolve(projectRoot, '../book-power/.env'),
    resolve(projectRoot, '.private/openai.env'),
  ];
  for (const envPath of envPaths) {
    let text;
    try {
      text = await readFile(envPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || !allowedKeys.has(match[1]) || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
    }
  }
}

function sourceSentences(body) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return [...segmenter.segment(body)]
    .map(item => item.segment.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `S${String(index + 1).padStart(3, '0')}`, text }));
}

function sourceInput(entry, sentences) {
  return [
    `ENTRY ID: ${entry.id}`,
    `TYPE: ${entry.type}`,
    `TITLE: ${entry.title}`,
    `SOURCE-AUTHORED SUMMARY: ${entry.summary}`,
    `AUTHORS: ${entry.authors.join(', ') || 'Not listed'}`,
    '',
    'SOURCE SENTENCES:',
    ...sentences.map(sentence => `${sentence.id}: ${sentence.text}`),
  ].join('\n');
}

function collectEvidenceQuotes(card) {
  return [
    ...card.oneSentence.evidenceQuotes,
    ...card.purposes.flatMap(item => item.evidenceQuotes),
    ...card.problemContext.flatMap(item => item.evidenceQuotes),
    ...card.mechanisms.flatMap(item => item.evidenceQuotes),
    ...card.actorsAndRoles.flatMap(item => item.evidenceQuotes),
    ...card.enablingConditions.flatMap(item => item.evidenceQuotes),
    ...card.constraints.flatMap(item => item.evidenceQuotes),
    ...card.tensions.flatMap(item => item.evidenceQuotes),
    ...card.observableSignals.flatMap(item => item.evidenceQuotes),
    ...card.transferQuestions.flatMap(item => item.evidenceQuotes),
    ...card.searchConcepts.flatMap(item => item.evidenceQuotes),
  ];
}

function collectSentenceIds(value, key) {
  if (Array.isArray(value)) {
    if (key === 'evidenceSentenceIds') return value;
    return value.flatMap(item => collectSentenceIds(item));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([itemKey, item]) => collectSentenceIds(item, itemKey));
  }
  return [];
}

function materializeEvidence(value, sentenceMap, key) {
  if (Array.isArray(value)) {
    if (key === 'evidenceSentenceIds') return value.map(id => sentenceMap.get(id));
    return value.map(item => materializeEvidence(item, sentenceMap));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([itemKey, item]) => [
      itemKey === 'evidenceSentenceIds' ? 'evidenceQuotes' : itemKey,
      materializeEvidence(item, sentenceMap, itemKey),
    ]));
  }
  return value;
}

function validateMaterializedCard(entry, card) {
  const problems = [];
  if (card.entryId !== entry.id) problems.push(`entryId was ${card.entryId}`);

  const evidenceQuotes = collectEvidenceQuotes(card);
  evidenceQuotes.forEach((quote, index) => {
    if (!entry.body.includes(quote)) {
      problems.push(`evidence quote ${index + 1} is not exact: ${JSON.stringify(quote.slice(0, 160))}`);
    }
  });

  if (card.mechanisms.length === 0) problems.push('no mechanisms extracted');
  if (card.actorsAndRoles.length === 0) problems.push('no actors and roles extracted');
  if (card.transferQuestions.length < 2) problems.push('fewer than two transfer questions extracted');
  if (card.searchConcepts.length < 3) problems.push('fewer than three search concepts extracted');
  if (card.enablingConditions.length + card.constraints.length + card.tensions.length === 0) {
    problems.push('no conditions, constraints, or tensions extracted');
  }
  card.purposes.forEach((item, index) => {
    if (/^(?:to\s+)?(?:describe|document|highlight|illustrate|explain|present)\b/i.test(item.claim)) {
      problems.push(`purpose ${index + 1} states an editorial purpose`);
    }
  });
  card.transferQuestions.forEach((item, index) => {
    if (/groundedIn:|\bS\d{3}\b/i.test(`${item.question} ${item.rationale}`)) {
      problems.push(`transfer question ${index + 1} contains citation syntax in prose`);
    }
  });

  return { card, evidenceQuotes: evidenceQuotes.length, problems };
}

function validateCard(entry, candidate, sentences = sourceSentences(entry.body)) {
  const sentenceMap = new Map(sentences.map(sentence => [sentence.id, sentence.text]));
  const invalidIds = [...new Set(collectSentenceIds(candidate).filter(id => !sentenceMap.has(id)))];
  if (invalidIds.length > 0) {
    return { card: undefined, evidenceQuotes: 0, problems: [`unknown sentence IDs: ${invalidIds.join(', ')}`] };
  }

  const card = methodCardSchema.parse(materializeEvidence(candidate, sentenceMap));
  return validateMaterializedCard(entry, card);
}

function outputText(response) {
  return (response.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('');
}

async function requestCard(entry, apiKey, model, previousProblems = [], semanticFeedback) {
  const sentences = sourceSentences(entry.body);
  const input = [
    sourceInput(entry, sentences),
    ...(semanticFeedback
      ? [
        '',
        'SEMANTIC VERIFICATION FEEDBACK ON A REJECTED EARLIER CARD:',
        JSON.stringify(semanticFeedback, null, 2),
        '',
        'Generate a complete replacement card. Do not repeat unsupported items. Place misclassified ideas only in their corrected fields. Preserve supported items when they remain useful, but do not copy the rejected card wholesale.',
      ]
      : []),
    ...(previousProblems.length > 0
      ? ['', 'RETRY CORRECTIONS:', ...previousProblems.map(problem => `- ${problem}`)]
      : []),
  ].join('\n');
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: 'minimal' },
      text: {
        format: {
          type: 'json_schema',
          name: 'beautiful_solutions_method_card',
          description: 'A source-grounded method card with citations to numbered source sentences.',
          strict: true,
          schema: methodCardJsonSchema,
        },
      },
      max_output_tokens: 10000,
      store: false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${payload.error?.message ?? 'unknown error'}`);
  }

  const text = outputText(payload);
  if (!text) {
    const refusal = (payload.output ?? []).flatMap(item => item.content ?? []).find(item => item.type === 'refusal');
    throw new Error(refusal ? `Model refusal: ${refusal.refusal}` : `No output text (status: ${payload.status ?? 'unknown'})`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Model output was not valid JSON');
  }

  return {
    responseId: payload.id,
    usage: payload.usage,
    ...validateCard(entry, parsed, sentences),
  };
}

async function extractEntry(entry, apiKey, model) {
  const sourceHash = sha256(JSON.stringify({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    summary: entry.summary,
    authors: entry.authors,
    body: entry.body,
  }));
  const cacheKey = sha256(`${promptVersion}\n${model}\n${sourceHash}`);
  const cachePath = resolve(cacheDir, `${entry.id}-${cacheKey.slice(0, 16)}.json`);
  const attemptLogPath = resolve(cacheDir, `${entry.id}-${cacheKey.slice(0, 16)}-${Date.now()}-attempts.json`);

  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    const parsed = methodCardSchema.safeParse(cached.card);
    const validation = parsed.success ? validateMaterializedCard(entry, parsed.data) : { problems: ['schema failure'] };
    if (
      cached.promptVersion === promptVersion
      && cached.model === model
      && cached.sourceHash === sourceHash
      && validation.problems.length === 0
    ) {
      return { ...cached, cacheHit: true };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }

  let previousProblems = [];
  const requestUsage = {};
  const responseIds = [];
  const attemptRecords = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await requestCard(entry, apiKey, model, previousProblems);
    addUsage(requestUsage, result.usage);
    responseIds.push(result.responseId);
    attemptRecords.push({
      attempt,
      responseId: result.responseId,
      usage: result.usage,
      problems: result.problems,
    });
    await writeFile(attemptLogPath, `${JSON.stringify({
      schemaVersion: 1,
      promptVersion,
      model,
      sourceHash,
      attempts: attemptRecords,
      cumulativeUsage: requestUsage,
    }, null, 2)}\n`, 'utf8');
    if (result.problems.length === 0) {
      const artifact = {
        schemaVersion: 1,
        promptVersion,
        model,
        sourceHash,
        extractedAt: new Date().toISOString(),
        responseIds,
        attempts: attempt,
        usage: requestUsage,
        evidenceQuotes: result.evidenceQuotes,
        card: result.card,
      };
      await writeFile(cachePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      return { ...artifact, cacheHit: false };
    }
    previousProblems = result.problems;
  }

  throw new Error(`${entry.id}: failed quality gates after two attempts (${previousProblems.join('; ')})`);
}

async function regenerateEntry(entry, previousExtraction, semanticFeedback, apiKey, model, round) {
  const feedbackHash = sha256(JSON.stringify(semanticFeedback));
  const priorCardHash = sha256(JSON.stringify(previousExtraction.card));
  const cacheKey = sha256([
    regenerationPromptVersion,
    model,
    previousExtraction.sourceHash,
    priorCardHash,
    feedbackHash,
    String(round),
  ].join('\n'));
  const cachePath = resolve(cacheDir, `${entry.id}-${cacheKey.slice(0, 16)}.json`);
  const attemptLogPath = resolve(cacheDir, `${entry.id}-${cacheKey.slice(0, 16)}-${Date.now()}-attempts.json`);

  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    const parsed = methodCardSchema.safeParse(cached.card);
    const validation = parsed.success ? validateMaterializedCard(entry, parsed.data) : { problems: ['schema failure'] };
    if (
      cached.promptVersion === regenerationPromptVersion
      && cached.model === model
      && cached.sourceHash === previousExtraction.sourceHash
      && cached.priorCardHash === priorCardHash
      && cached.feedbackHash === feedbackHash
      && validation.problems.length === 0
    ) {
      return { ...cached, cacheHit: true };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }

  let previousProblems = [];
  const requestUsage = {};
  const responseIds = [];
  const attemptRecords = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await requestCard(entry, apiKey, model, previousProblems, semanticFeedback);
    addUsage(requestUsage, result.usage);
    responseIds.push(result.responseId);
    attemptRecords.push({
      attempt,
      responseId: result.responseId,
      usage: result.usage,
      problems: result.problems,
    });
    await writeFile(attemptLogPath, `${JSON.stringify({
      schemaVersion: 1,
      promptVersion: regenerationPromptVersion,
      model,
      sourceHash: previousExtraction.sourceHash,
      priorCardHash,
      feedbackHash,
      round,
      attempts: attemptRecords,
      cumulativeUsage: requestUsage,
    }, null, 2)}\n`, 'utf8');
    if (result.problems.length === 0) {
      const artifact = {
        schemaVersion: 1,
        promptVersion: regenerationPromptVersion,
        model,
        sourceHash: previousExtraction.sourceHash,
        priorCardHash,
        feedbackHash,
        regenerationRound: round,
        extractedAt: new Date().toISOString(),
        responseIds,
        attempts: attempt,
        usage: requestUsage,
        evidenceQuotes: result.evidenceQuotes,
        semanticFeedback,
        card: result.card,
      };
      await writeFile(cachePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      return { ...artifact, cacheHit: false };
    }
    previousProblems = result.problems;
  }

  throw new Error(`${entry.id}: regeneration failed quality gates after two attempts (${previousProblems.join('; ')})`);
}

function candidateItemContent(field, item) {
  if (field === 'actorsAndRoles') return { actor: item.actor, role: item.role };
  if (field === 'transferQuestions') return { question: item.question, rationale: item.rationale };
  if (field === 'searchConcepts') return { label: item.label };
  return { claim: item.claim };
}

function candidateItems(card, sentences) {
  const sentenceIdByText = new Map(sentences.map(sentence => [sentence.text, sentence.id]));
  const makeItem = (itemId, currentField, item) => {
    const evidenceSentenceIds = item.evidenceQuotes.map(quote => sentenceIdByText.get(quote));
    if (evidenceSentenceIds.some(id => !id)) {
      throw new Error(`${card.entryId} ${itemId}: candidate evidence did not map to a source sentence`);
    }
    return {
      itemId,
      currentField,
      content: candidateItemContent(currentField, item),
      evidenceSentenceIds,
    };
  };

  return [
    makeItem('oneSentence', 'oneSentence', card.oneSentence),
    ...cardFields.filter(field => field !== 'oneSentence').flatMap(field =>
      card[field].map((item, index) => makeItem(`${field}.${index}`, field, item))),
  ];
}

function candidateItemText(item) {
  if (item.content.claim) return item.content.claim;
  if (item.content.question) return item.content.question;
  if (item.content.label) return item.content.label;
  return `${item.content.actor}: ${item.content.role}`;
}

function scoreCalibration(entry, card, verification, calibration) {
  const items = candidateItems(card, sourceSentences(entry.body));
  const itemById = new Map(items.map(item => [item.itemId, item]));
  const decisionById = new Map(verification.decisions.map(decision => [decision.itemId, decision]));
  const labels = calibration.labels.filter(label => label.entryId === entry.id);
  const results = labels.map(label => {
    const item = itemById.get(label.itemId);
    if (!item || candidateItemText(item) !== label.itemText) {
      return { ...label, status: 'not_applicable' };
    }
    const decision = decisionById.get(label.itemId);
    const passed = decision
      && decision.verdict === label.expectedVerdict
      && decision.targetField === label.expectedTargetField;
    return {
      ...label,
      status: passed ? 'passed' : 'failed',
      actualVerdict: decision?.verdict,
      actualTargetField: decision?.targetField,
    };
  });
  return {
    labels: results.length,
    applicable: results.filter(result => result.status !== 'not_applicable').length,
    passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length,
    notApplicable: results.filter(result => result.status === 'not_applicable').length,
    results,
  };
}

function applyCalibrationOverrides(entry, card, verification, calibrationScore) {
  const sentences = sourceSentences(entry.body);
  const sentenceMap = new Map(sentences.map(sentence => [sentence.id, sentence.text]));
  const itemById = new Map(candidateItems(card, sentences).map(item => [item.itemId, item]));
  const overrides = calibrationScore.results
    .filter(result => result.status === 'failed')
    .map(result => {
      const item = itemById.get(result.itemId);
      return {
        itemId: result.itemId,
        verdict: result.expectedVerdict,
        targetField: result.expectedTargetField,
        rationale: `Manual calibration: ${result.note}`,
        evidenceSentenceIds: item?.evidenceSentenceIds ?? [],
        evidenceQuotes: (item?.evidenceSentenceIds ?? []).map(id => sentenceMap.get(id)).filter(Boolean),
      };
    });
  const overrideById = new Map(overrides.map(override => [override.itemId, override]));
  return {
    verification: {
      ...verification,
      decisions: verification.decisions.map(decision => overrideById.get(decision.itemId) ?? decision),
    },
    overrides,
  };
}

function uniqueFeedbackItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = JSON.stringify([item.itemText, item.verdict, item.targetField, item.rationale]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRegenerationFeedback(card, verification, applied, calibration, previousFeedback) {
  const itemTextById = new Map();
  itemTextById.set('oneSentence', card.oneSentence.claim);
  for (const field of cardFields.filter(item => item !== 'oneSentence')) {
    card[field].forEach((item, index) => {
      itemTextById.set(`${field}.${index}`, item.claim ?? item.question ?? item.label ?? `${item.actor}: ${item.role}`);
    });
  }
  const currentRejectedOrMovedItems = verification.decisions
    .filter(decision => decision.verdict !== 'supported')
    .map(decision => ({
      itemId: decision.itemId,
      itemText: itemTextById.get(decision.itemId),
      verdict: decision.verdict,
      targetField: decision.targetField,
      rationale: decision.rationale,
    }));
  const currentManualOverrides = calibration.overrides.map(override => ({
    itemId: override.itemId,
    verdict: override.verdict,
    targetField: override.targetField,
    rationale: override.rationale,
  }));
  return {
    qualityProblems: [...new Set([
      ...(previousFeedback?.qualityProblems ?? []),
      ...applied.problems,
    ])],
    rejectedOrMovedItems: uniqueFeedbackItems([
      ...(previousFeedback?.rejectedOrMovedItems ?? []),
      ...currentRejectedOrMovedItems,
    ]),
    manualCalibrationOverrides: uniqueFeedbackItems([
      ...(previousFeedback?.manualCalibrationOverrides ?? []),
      ...currentManualOverrides,
    ]),
  };
}

function validateVerification(entry, candidate, items, sentences) {
  const verification = verificationResultSchema.parse(candidate);
  const problems = [];
  if (verification.entryId !== entry.id) problems.push(`entryId was ${verification.entryId}`);

  const itemById = new Map(items.map(item => [item.itemId, item]));
  const decisionIds = verification.decisions.map(decision => decision.itemId);
  const duplicateIds = decisionIds.filter((id, index) => decisionIds.indexOf(id) !== index);
  const missingIds = items.map(item => item.itemId).filter(id => !decisionIds.includes(id));
  const extraIds = decisionIds.filter(id => !itemById.has(id));
  if (duplicateIds.length > 0) problems.push(`duplicate decisions: ${[...new Set(duplicateIds)].join(', ')}`);
  if (missingIds.length > 0) problems.push(`missing decisions: ${missingIds.join(', ')}`);
  if (extraIds.length > 0) problems.push(`unknown decisions: ${extraIds.join(', ')}`);

  const sentenceMap = new Map(sentences.map(sentence => [sentence.id, sentence.text]));
  for (const decision of verification.decisions) {
    const item = itemById.get(decision.itemId);
    if (!item) continue;
    const invalidSentenceIds = decision.evidenceSentenceIds.filter(id => !sentenceMap.has(id));
    if (invalidSentenceIds.length > 0) {
      problems.push(`${decision.itemId} cites unknown sentences: ${invalidSentenceIds.join(', ')}`);
    }
    if (decision.verdict !== 'unsupported' && decision.evidenceSentenceIds.length === 0) {
      problems.push(`${decision.itemId} has no verifier evidence`);
    }
    if (
      decision.verdict !== 'unsupported'
      && item.currentField !== 'transferQuestions'
      && /\b(?:imply|implies|implied|suggest|suggests|suggested|indicate|indicates|indicated|indicating)\b/i.test(decision.rationale)
    ) {
      problems.push(`${decision.itemId} verifier rationale admits an inference`);
    }
    if (decision.verdict === 'supported' && decision.targetField !== item.currentField) {
      problems.push(`${decision.itemId} is supported but targets ${decision.targetField}`);
    }
    if (decision.verdict === 'unsupported' && decision.targetField !== 'remove') {
      problems.push(`${decision.itemId} is unsupported but targets ${decision.targetField}`);
    }
    if (decision.verdict === 'misclassified') {
      if (!movableClaimFields.includes(item.currentField) || !movableClaimFields.includes(decision.targetField)) {
        problems.push(`${decision.itemId} cannot move from ${item.currentField} to ${decision.targetField}`);
      } else if (decision.targetField === item.currentField) {
        problems.push(`${decision.itemId} is misclassified but keeps the same field`);
      }
    }
  }

  return {
    verification: {
      ...verification,
      decisions: verification.decisions.map(decision => ({
        ...decision,
        evidenceQuotes: decision.evidenceSentenceIds.map(id => sentenceMap.get(id)).filter(Boolean),
      })),
    },
    problems,
  };
}

function applyVerification(entry, card, verification) {
  const decisionById = new Map(verification.decisions.map(decision => [decision.itemId, decision]));
  const verifiedCard = {
    entryId: card.entryId,
    oneSentence: card.oneSentence,
    ...Object.fromEntries(cardFields.filter(field => field !== 'oneSentence').map(field => [field, []])),
  };
  const retainedItemIds = Object.fromEntries(cardFields.filter(field => field !== 'oneSentence').map(field => [field, []]));
  const actions = { supported: 0, reclassified: 0, removed: 0, deduplicated: 0 };
  const applicationLog = [];
  const oneSentenceDecision = decisionById.get('oneSentence');
  if (!oneSentenceDecision || oneSentenceDecision.verdict !== 'supported') {
    return { verifiedCard: undefined, actions, applicationLog, problems: ['oneSentence was not verified as supported'] };
  }
  actions.supported += 1;

  for (const field of cardFields.filter(item => item !== 'oneSentence')) {
    card[field].forEach((item, index) => {
      const decision = decisionById.get(`${field}.${index}`);
      if (!decision) return;
      if (decision.verdict === 'supported') {
        verifiedCard[field].push(item);
        retainedItemIds[field].push(`${field}.${index}`);
        actions.supported += 1;
      } else if (decision.verdict === 'misclassified') {
        const evidenceKey = JSON.stringify([...item.evidenceQuotes].sort());
        const duplicateIndex = verifiedCard[decision.targetField]
          .findIndex(candidate => JSON.stringify([...candidate.evidenceQuotes].sort()) === evidenceKey);
        if (duplicateIndex >= 0) {
          actions.deduplicated += 1;
          applicationLog.push({
            itemId: `${field}.${index}`,
            action: 'deduplicated_after_reclassification',
            targetField: decision.targetField,
            duplicateOf: retainedItemIds[decision.targetField][duplicateIndex],
          });
        } else {
          verifiedCard[decision.targetField].push(item);
          retainedItemIds[decision.targetField].push(`${field}.${index}`);
          actions.reclassified += 1;
          applicationLog.push({
            itemId: `${field}.${index}`,
            action: 'reclassified',
            targetField: decision.targetField,
          });
        }
      } else {
        actions.removed += 1;
        applicationLog.push({ itemId: `${field}.${index}`, action: 'removed' });
      }
    });
  }

  const parsed = methodCardSchema.safeParse(verifiedCard);
  if (!parsed.success) {
    return { verifiedCard: undefined, actions, applicationLog, problems: ['verified card failed its structural schema'] };
  }
  const validation = validateMaterializedCard(entry, parsed.data);
  return { verifiedCard: parsed.data, actions, applicationLog, problems: validation.problems };
}

async function requestVerification(entry, card, apiKey, model, previousProblems = []) {
  const sentences = sourceSentences(entry.body);
  const items = candidateItems(card, sentences);
  const input = [
    sourceInput(entry, sentences),
    '',
    'CANDIDATE ITEMS:',
    JSON.stringify(items, null, 2),
    ...(previousProblems.length > 0
      ? ['', 'RETRY CORRECTIONS:', ...previousProblems.map(problem => `- ${problem}`)]
      : []),
  ].join('\n');
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: verificationInstructions,
      input,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'beautiful_solutions_method_card_verification',
          description: 'One semantic verification decision for every candidate method-card item.',
          strict: true,
          schema: verificationJsonSchema,
        },
      },
      max_output_tokens: 12000,
      store: false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI verification failed (${response.status}): ${payload.error?.message ?? 'unknown error'}`);
  }

  const text = outputText(payload);
  if (!text) {
    const refusal = (payload.output ?? []).flatMap(item => item.content ?? []).find(item => item.type === 'refusal');
    throw new Error(refusal ? `Verifier refusal: ${refusal.refusal}` : `No verifier output text (status: ${payload.status ?? 'unknown'})`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Verifier output was not valid JSON');
  }
  return {
    responseId: payload.id,
    usage: payload.usage,
    ...validateVerification(entry, parsed, items, sentences),
  };
}

async function verifyEntry(entry, extraction, apiKey, model) {
  const cardHash = sha256(JSON.stringify(extraction.card));
  const cacheKey = sha256(`${verificationPromptVersion}\n${model}\n${extraction.sourceHash}\n${cardHash}`);
  const cachePath = resolve(verificationCacheDir, `${entry.id}-${cacheKey.slice(0, 16)}.json`);
  const attemptLogPath = resolve(verificationCacheDir, `${entry.id}-${cacheKey.slice(0, 16)}-${Date.now()}-attempts.json`);

  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    const applied = applyVerification(entry, extraction.card, cached.verification);
    if (
      cached.promptVersion === verificationPromptVersion
      && cached.model === model
      && cached.sourceHash === extraction.sourceHash
      && cached.cardHash === cardHash
    ) {
      return {
        ...cached,
        accepted: applied.problems.length === 0,
        problems: applied.problems,
        actions: applied.actions,
        applicationLog: applied.applicationLog,
        verifiedCard: applied.verifiedCard,
        cacheHit: true,
      };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }

  let previousProblems = [];
  const requestUsage = {};
  const responseIds = [];
  const attemptRecords = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await requestVerification(entry, extraction.card, apiKey, model, previousProblems);
    addUsage(requestUsage, result.usage);
    responseIds.push(result.responseId);
    const applied = result.problems.length === 0
      ? applyVerification(entry, extraction.card, result.verification)
      : { problems: [], actions: undefined, applicationLog: undefined, verifiedCard: undefined };
    const problems = [...result.problems, ...applied.problems];
    attemptRecords.push({
      attempt,
      responseId: result.responseId,
      usage: result.usage,
      problems,
      verification: result.verification,
      application: result.problems.length === 0 ? {
        actions: applied.actions,
        applicationLog: applied.applicationLog,
        verifiedCard: applied.verifiedCard,
      } : undefined,
    });
    await writeFile(attemptLogPath, `${JSON.stringify({
      schemaVersion: 1,
      promptVersion: verificationPromptVersion,
      model,
      sourceHash: extraction.sourceHash,
      cardHash,
      attempts: attemptRecords,
      cumulativeUsage: requestUsage,
    }, null, 2)}\n`, 'utf8');
    if (result.problems.length === 0) {
      const artifact = {
        schemaVersion: 1,
        promptVersion: verificationPromptVersion,
        model,
        sourceHash: extraction.sourceHash,
        cardHash,
        verifiedAt: new Date().toISOString(),
        responseIds,
        attempts: attempt,
        usage: requestUsage,
        accepted: applied.problems.length === 0,
        problems: applied.problems,
        verification: result.verification,
        actions: applied.actions,
        applicationLog: applied.applicationLog,
        verifiedCard: applied.verifiedCard,
      };
      await writeFile(cachePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      return { ...artifact, cacheHit: false };
    }
    previousProblems = problems;
  }

  throw new Error(`${entry.id}: verifier failed quality gates after two attempts (${previousProblems.join('; ')})`);
}

function addUsage(total, usage) {
  for (const key of ['input_tokens', 'output_tokens', 'total_tokens']) {
    total[key] = (total[key] ?? 0) + (usage?.[key] ?? 0);
  }
}

async function main() {
  if (!process.argv.includes('--pilot')) {
    throw new Error('Only the explicit --pilot mode is implemented; the full corpus requires a separate approval.');
  }

  await loadEnvFile();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required in the environment, sibling book-power/.env, or ignored .private/openai.env file.');
  }
  const model = process.env.OPENAI_EXTRACTION_MODEL || defaultModel;
  const verificationModel = process.env.OPENAI_VERIFICATION_MODEL || defaultVerificationModel;

  const sourceText = await readFile(sourcePath, 'utf8');
  const source = JSON.parse(sourceText);
  const calibration = JSON.parse(await readFile(calibrationPath, 'utf8'));
  if (calibration.sourceSha256 !== sha256(sourceText)) {
    throw new Error('Manual calibration labels do not match the build-time source snapshot.');
  }
  if (calibration.candidatePromptVersion !== promptVersion) {
    throw new Error('Manual calibration labels do not match the candidate extraction prompt version.');
  }
  const byId = new Map(source.entries.map(entry => [entry.id, entry]));
  const entryFlag = process.argv.indexOf('--entry');
  const requestedIds = entryFlag >= 0 ? [process.argv[entryFlag + 1]] : pilotIds;
  if (requestedIds.some(id => !id)) throw new Error('--entry requires an entry ID.');
  const entries = requestedIds.map(id => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Pilot source entry not found: ${id}`);
    if (!entry.body) throw new Error(`Pilot source entry has no body: ${id}`);
    return entry;
  });

  await Promise.all([
    mkdir(cacheDir, { recursive: true }),
    mkdir(verificationCacheDir, { recursive: true }),
  ]);
  const results = [];
  const extractionUsage = {};
  const verificationUsage = {};
  for (const entry of entries) {
    let extraction = await extractEntry(entry, apiKey, model);
    if (!extraction.cacheHit) addUsage(extractionUsage, extraction.usage);
    const rounds = [];
    let finalCard;
    let status = 'failed';
    let calibrationFailed = false;

    for (let round = 0; round <= maxRegenerationRounds; round += 1) {
      const verification = await verifyEntry(entry, extraction, apiKey, verificationModel);
      if (!verification.cacheHit) addUsage(verificationUsage, verification.usage);
      const calibrationScore = scoreCalibration(entry, extraction.card, verification.verification, calibration);
      if (calibrationScore.failed > 0) calibrationFailed = true;
      const calibrated = applyCalibrationOverrides(
        entry,
        extraction.card,
        verification.verification,
        calibrationScore,
      );
      const applied = applyVerification(entry, extraction.card, calibrated.verification);
      rounds.push({
        round,
        extraction: Object.fromEntries(Object.entries(extraction).filter(([key]) => key !== 'cacheHit')),
        verification: Object.fromEntries(Object.entries(verification).filter(([key]) => key !== 'cacheHit')),
        calibration: calibrationScore,
        manualOverrides: calibrated.overrides,
        calibratedApplication: {
          actions: applied.actions,
          applicationLog: applied.applicationLog,
          problems: applied.problems,
          verifiedCard: applied.verifiedCard,
        },
      });

      console.log([
        `${entry.id} round ${round}: ${extraction.cacheHit ? 'extraction cache hit' : round === 0 ? 'extracted' : 'regenerated'}`,
        `${verification.cacheHit ? 'verification cache hit' : 'verified'}`,
        `${calibrationScore.passed}/${calibrationScore.applicable} calibration labels passed`,
        `${applied.actions.reclassified} reclassified`,
        `${applied.actions.removed} removed`,
        `${applied.actions.deduplicated} deduplicated`,
      ].join('; '));

      if (applied.problems.length === 0) {
        finalCard = applied.verifiedCard;
        status = 'accepted';
        break;
      }
      if (round === maxRegenerationRounds) break;

      const feedback = buildRegenerationFeedback(
        extraction.card,
        calibrated.verification,
        applied,
        calibrated,
        extraction.semanticFeedback,
      );
      extraction = await regenerateEntry(entry, extraction, feedback, apiKey, model, round + 1);
      if (!extraction.cacheHit) addUsage(extractionUsage, extraction.usage);
    }

    results.push({
      entryId: entry.id,
      status,
      verifierDisagreedWithManualLabel: calibrationFailed,
      finalCard,
      rounds,
    });
  }

  const totalUsage = {};
  addUsage(totalUsage, extractionUsage);
  addUsage(totalUsage, verificationUsage);

  const output = {
    schemaVersion: 3,
    kind: 'Beautiful Solutions calibrated and verified method-card extraction pilot',
    promptVersion,
    model,
    verificationPromptVersion,
    verificationModel,
    generatedAt: new Date().toISOString(),
    sourcePath: '.source-cache/toolbox-full.json',
    calibrationPath: 'evaluation/method-card-pilot-labels.json',
    entries: results,
    runUsage: {
      extraction: extractionUsage,
      verification: verificationUsage,
      total: totalUsage,
    },
  };
  await writeFile(pilotOutputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Pilot artifact: .source-cache/${pilotOutputPath.split(/[\\/]/).at(-1)}`);
  console.log(`Run usage: ${totalUsage.input_tokens ?? 0} input, ${totalUsage.output_tokens ?? 0} output, ${totalUsage.total_tokens ?? 0} total tokens`);
  const accepted = results.filter(result => result.status === 'accepted').length;
  console.log(`Pilot verdict: ${accepted}/${results.length} entries accepted.`);
  const disagreementEntries = results.filter(result => result.verifierDisagreedWithManualLabel).length;
  console.log(`Manual calibration overrides were required for ${disagreementEntries}/${results.length} entries.`);
  if (accepted !== results.length) process.exitCode = 1;
}

await main();
