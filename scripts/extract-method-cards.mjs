import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, '.source-cache/toolbox-full.json');
const cacheDir = resolve(projectRoot, '.source-cache/extraction-cache');
const pilotOutputPath = resolve(projectRoot, '.source-cache/method-cards-pilot.json');
const apiUrl = 'https://api.openai.com/v1/responses';
const promptVersion = 'method-card-v4-problem-context';
const defaultModel = 'gpt-5-mini';
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function loadEnvFile() {
  let text;
  try {
    text = await readFile(resolve(projectRoot, '.private/openai.env'), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
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

function validateCard(entry, candidate, sentences = sourceSentences(entry.body)) {
  const problems = [];
  const sentenceMap = new Map(sentences.map(sentence => [sentence.id, sentence.text]));
  const invalidIds = [...new Set(collectSentenceIds(candidate).filter(id => !sentenceMap.has(id)))];
  if (invalidIds.length > 0) problems.push(`unknown sentence IDs: ${invalidIds.join(', ')}`);
  if (problems.length > 0) return { card: undefined, evidenceQuotes: 0, problems };

  const card = methodCardSchema.parse(materializeEvidence(candidate, sentenceMap));
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

function outputText(response) {
  return (response.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('');
}

async function requestCard(entry, apiKey, model, previousProblems = []) {
  const sentences = sourceSentences(entry.body);
  const input = previousProblems.length === 0
    ? sourceInput(entry, sentences)
    : `${sourceInput(entry, sentences)}\n\nRETRY CORRECTIONS:\n${previousProblems.map(problem => `- ${problem}`).join('\n')}`;
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
  const attemptLogPath = resolve(cacheDir, `${entry.id}-${cacheKey.slice(0, 16)}-attempts.json`);

  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    const validation = methodCardSchema.safeParse(cached.card);
    if (cached.promptVersion === promptVersion && cached.model === model && cached.sourceHash === sourceHash && validation.success) {
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
  if (!apiKey) throw new Error('OPENAI_API_KEY is required in the environment or ignored .private/openai.env file.');
  const model = process.env.OPENAI_EXTRACTION_MODEL || defaultModel;

  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
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

  await mkdir(cacheDir, { recursive: true });
  const artifacts = [];
  const usage = {};
  for (const entry of entries) {
    const artifact = await extractEntry(entry, apiKey, model);
    artifacts.push(artifact);
    if (!artifact.cacheHit) addUsage(usage, artifact.usage);
    console.log(`${entry.id}: ${artifact.cacheHit ? 'cache hit' : 'extracted'}; ${artifact.evidenceQuotes} verified evidence quotes`);
  }

  const output = {
    schemaVersion: 1,
    kind: 'Beautiful Solutions method-card extraction pilot',
    promptVersion,
    model,
    generatedAt: new Date().toISOString(),
    sourcePath: '.source-cache/toolbox-full.json',
    entries: artifacts.map(({ cacheHit: _cacheHit, ...artifact }) => artifact),
    runUsage: usage,
  };
  await writeFile(pilotOutputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Pilot artifact: .source-cache/${pilotOutputPath.split(/[\\/]/).at(-1)}`);
  console.log(`Run usage: ${usage.input_tokens ?? 0} input, ${usage.output_tokens ?? 0} output, ${usage.total_tokens ?? 0} total tokens`);
}

await main();
