import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  candidateItemFingerprint,
  validateManualReplacementIdentities,
  validateReviewLabelIdentities,
} from './method-card-verification-policy.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, '.source-cache/toolbox-full.json');
const artifactPath = resolve(projectRoot, '.source-cache/method-cards-full.json');
const overridesPath = resolve(projectRoot, 'evaluation/method-card-corpus-overrides.json');
const acceptancePath = resolve(projectRoot, 'evaluation/method-card-corpus-acceptance.json');
const worksheetPath = resolve(projectRoot, '.source-cache/method-card-corpus-review.md');
const cardFields = [
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
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceSentences(body) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return [...segmenter.segment(body)]
    .map(item => item.segment.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `S${String(index + 1).padStart(3, '0')}`, text }));
}

function itemText(item) {
  if (item.claim) return item.claim;
  if (item.question) return `${item.question} — ${item.rationale}`;
  if (item.label) return item.label;
  return `${item.actor}: ${item.role}`;
}

function cardItems(card) {
  return [
    { itemId: 'oneSentence', field: 'oneSentence', item: card.oneSentence },
    ...cardFields.filter(field => field !== 'oneSentence').flatMap(field =>
      card[field].map((item, index) => ({ itemId: `${field}.${index}`, field, item }))),
  ];
}

function similarity(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter(value => rightSet.has(value)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function compactProblems(problems) {
  const shown = problems.slice(0, 50);
  if (problems.length > shown.length) shown.push(`…and ${problems.length - shown.length} more`);
  return shown.join('\n');
}

const sourceText = await readFile(sourcePath, 'utf8');
const artifactText = await readFile(artifactPath, 'utf8');
const overridesText = await readFile(overridesPath, 'utf8');
const acceptanceText = await readFile(acceptancePath, 'utf8');
const source = JSON.parse(sourceText);
const artifact = JSON.parse(artifactText);
const overrides = JSON.parse(overridesText);
const acceptance = JSON.parse(acceptanceText);
const sourceById = new Map(source.entries.map(entry => [entry.id, entry]));
const acceptanceById = new Map(acceptance.entries?.map(entry => [entry.entryId, entry]) ?? []);
const problems = [];

if (overrides.schemaVersion !== 2) problems.push(`manual override schemaVersion is ${overrides.schemaVersion}, expected 2`);
for (const problem of validateReviewLabelIdentities(overrides.labels ?? [])) {
  problems.push(`manual override ${problem}`);
}
for (const [index, record] of (overrides.supersededLabels ?? []).entries()) {
  for (const problem of validateReviewLabelIdentities([record.label])) {
    problems.push(`supersededLabels.${index} ${problem.replace(/^labels\.0/, 'label')}`);
  }
}
for (const problem of validateManualReplacementIdentities(overrides.manualReplacements ?? [])) {
  problems.push(`manual replacement ${problem}`);
}
if (overrides.sourceSha256 !== sha256(sourceText)) {
  problems.push('manual overrides do not match the build-time source snapshot');
}
if (acceptance.schemaVersion !== 1) problems.push(`acceptance schemaVersion is ${acceptance.schemaVersion}, expected 1`);
if (acceptance.sourceSha256 !== sha256(sourceText)) {
  problems.push('manual acceptance does not match the build-time source snapshot');
}
if (acceptance.manualOverridesSha256 !== sha256(overridesText)) {
  problems.push('manual acceptance does not match the tracked override fixture');
}
if (
  acceptance.candidatePromptVersion !== artifact.promptVersion
  || acceptance.candidateModel !== artifact.model
  || acceptance.verificationPromptVersion !== artifact.verificationPromptVersion
  || acceptance.verificationModel !== artifact.verificationModel
) {
  problems.push('manual acceptance does not match the artifact extraction and verification configuration');
}
if (acceptanceById.size !== source.entries.length) {
  problems.push(`manual acceptance covers ${acceptanceById.size} entries, expected ${source.entries.length}`);
}
if (artifact.schemaVersion !== 5) problems.push(`artifact schemaVersion is ${artifact.schemaVersion}, expected 5`);
if (artifact.mode !== 'full') problems.push(`artifact mode is ${artifact.mode ?? 'missing'}, not full`);
if (artifact.sourceSha256 !== sha256(sourceText)) problems.push('artifact sourceSha256 does not match toolbox-full.json');
if (
  overrides.candidatePromptVersion !== artifact.promptVersion
  || overrides.candidateModel !== artifact.model
  || overrides.verificationPromptVersion !== artifact.verificationPromptVersion
  || overrides.verificationModel !== artifact.verificationModel
) {
  problems.push('manual overrides do not match the artifact extraction and verification configuration');
}
if (artifact.manualOverridesSha256 !== sha256(overridesText)) {
  problems.push('artifact manualOverridesSha256 does not match the tracked override fixture');
}
if (artifact.requestedEntries !== source.entries.length) {
  problems.push(`requestedEntries is ${artifact.requestedEntries}, expected ${source.entries.length}`);
}
if (artifact.completedEntries !== source.entries.length) {
  problems.push(`completedEntries is ${artifact.completedEntries}, expected ${source.entries.length}`);
}
if (
  !artifact.manualOverrideCoverage
  || artifact.manualOverrideCoverage.expected !== overrides.labels?.length
  || artifact.manualOverrideCoverage.expected !== artifact.manualOverrideCoverage.covered
  || artifact.manualOverrideCoverage.uncovered?.length !== 0
) {
  problems.push('full-corpus manual override coverage is incomplete');
}
if (
  !artifact.manualReplacementCoverage
  || artifact.manualReplacementCoverage.expected !== overrides.manualReplacements?.length
  || artifact.manualReplacementCoverage.expected !== artifact.manualReplacementCoverage.covered
  || artifact.manualReplacementCoverage.uncovered?.length !== 0
) {
  problems.push('full-corpus manual replacement coverage is incomplete');
}

const seenIds = new Set();
const candidateFingerprintsByEntry = new Map();
const coveredLabelFingerprintsByEntry = new Map();
const appliedReplacementFingerprintsByEntry = new Map();
const worksheet = [
  '# Full-corpus method-card review worksheet',
  '',
  `- Source SHA-256: \`${sha256(sourceText)}\``,
  `- Artifact SHA-256: \`${sha256(artifactText)}\``,
  `- Manual overrides SHA-256: \`${sha256(overridesText)}\``,
  `- Manual acceptance SHA-256: \`${sha256(acceptanceText)}\``,
  `- Extraction: \`${artifact.model}\` / \`${artifact.promptVersion}\``,
  `- Verification: \`${artifact.verificationModel}\` / \`${artifact.verificationPromptVersion}\``,
  `- Entries: ${artifact.entries.length}`,
  '',
  'Every retained item below requires semantic review against its exact source sentences. Mechanical flags prioritize attention; an unflagged card is not automatically accepted.',
  '',
];

let itemCount = 0;
let evidenceCount = 0;
let flaggedEntries = 0;
let normalizationCount = 0;
for (const result of artifact.entries) {
  const sourceEntry = sourceById.get(result.entryId);
  if (!sourceEntry) {
    problems.push(`${result.entryId}: not present in source corpus`);
    continue;
  }
  if (seenIds.has(result.entryId)) problems.push(`${result.entryId}: duplicate artifact entry`);
  seenIds.add(result.entryId);
  if (result.entryType !== sourceEntry.type) {
    problems.push(`${result.entryId}: entryType ${result.entryType} does not match ${sourceEntry.type}`);
  }
  if (result.status !== 'accepted' || !result.finalCard) {
    problems.push(`${result.entryId}: status is ${result.status} without an accepted final card`);
    continue;
  }
  if (result.finalCard.entryId !== result.entryId) problems.push(`${result.entryId}: final-card ID mismatch`);
  const acceptanceRecord = acceptanceById.get(result.entryId);
  const finalCardSha256 = sha256(JSON.stringify(result.finalCard));
  if (!acceptanceRecord) {
    problems.push(`${result.entryId}: missing manual acceptance record`);
  } else if (acceptanceRecord.status !== 'accepted'
    || acceptanceRecord.finalCardSha256 !== finalCardSha256) {
    problems.push(`${result.entryId}: final card does not match its manual acceptance`);
  }

  const sentences = sourceSentences(sourceEntry.body);
  const sentenceIdByText = new Map(sentences.map(sentence => [sentence.text, sentence.id]));
  const candidateFingerprints = new Set();
  const coveredLabelFingerprints = new Set();
  const appliedReplacementFingerprints = new Set();
  for (const round of result.rounds ?? []) {
    for (const { itemId, field, item } of cardItems(round.extraction.card)) {
      const content = field === 'actorsAndRoles'
        ? { actor: item.actor, role: item.role }
        : field === 'transferQuestions'
          ? { question: item.question, rationale: item.rationale }
          : field === 'searchConcepts'
            ? { label: item.label }
            : { claim: item.claim };
      const candidate = {
        itemId,
        currentField: field,
        content,
        evidenceSentenceIds: item.evidenceQuotes.map(quote => sentenceIdByText.get(quote)),
      };
      candidateFingerprints.add(candidateItemFingerprint(candidate));
    }
    for (const score of round.corpusOverrideScore?.results ?? []) {
      if (score.status !== 'not_applicable') coveredLabelFingerprints.add(score.itemFingerprint);
    }
    for (const replacement of round.manualReplacements ?? []) {
      appliedReplacementFingerprints.add(replacement.replacesItemFingerprint);
    }
  }
  candidateFingerprintsByEntry.set(result.entryId, candidateFingerprints);
  coveredLabelFingerprintsByEntry.set(result.entryId, coveredLabelFingerprints);
  appliedReplacementFingerprintsByEntry.set(result.entryId, appliedReplacementFingerprints);
  const items = cardItems(result.finalCard);
  const flags = [];
  const normalizedTexts = new Set();
  const priorByField = new Map();
  for (const { itemId, field, item } of items) {
    itemCount += 1;
    const text = itemText(item);
    const normalized = text.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();
    if (normalizedTexts.has(`${field}\n${normalized}`)) flags.push(`${itemId}: exact normalized duplicate in ${field}`);
    normalizedTexts.add(`${field}\n${normalized}`);
    if (!Array.isArray(item.evidenceQuotes) || item.evidenceQuotes.length === 0) {
      problems.push(`${result.entryId} ${itemId}: no evidence quotes`);
      continue;
    }
    for (const quote of item.evidenceQuotes) {
      evidenceCount += 1;
      if (!sentenceIdByText.has(quote)) problems.push(`${result.entryId} ${itemId}: evidence is not one exact source sentence`);
    }
    const textTokens = normalized.split(' ').filter(token => token.length > 2);
    const priorItems = priorByField.get(field) ?? [];
    for (const prior of priorItems) {
      const textSimilarity = similarity(textTokens, prior.textTokens);
      const evidenceSimilarity = similarity(item.evidenceQuotes, prior.evidenceQuotes);
      if (textSimilarity >= 0.8 || (textSimilarity >= 0.45 && evidenceSimilarity >= 0.75)) {
        flags.push(`${itemId}: possible semantic duplicate of ${prior.itemId}`);
      }
    }
    priorItems.push({ itemId, textTokens, evidenceQuotes: item.evidenceQuotes });
    priorByField.set(field, priorItems);
    if (/\b(?:guarantees?|ensures?|always|universally applicable)\b/i.test(text)) {
      flags.push(`${itemId}: strong certainty language`);
    }
    if (field === 'transferQuestions' && /\b(?:best|should|must|most effective)\b/i.test(item.question)) {
      flags.push(`${itemId}: potentially advisory transfer question`);
    }
  }
  if (sourceEntry.type === 'question' && !/\b(?:asks?|question|explores?|considers?|inquir)/i.test(result.finalCard.oneSentence.claim)) {
    flags.push('oneSentence: question entry may have been converted into an answer');
  }
  if (result.rounds.length > 1) flags.push(`required ${result.rounds.length - 1} regeneration round(s)`);
  const finalRound = result.rounds.at(-1);
  normalizationCount += result.rounds.reduce(
    (total, round) => total + (round.verification?.normalizations?.length ?? 0),
    0,
  );
  const changed = finalRound?.application?.actions;
  if (changed && changed.removed + changed.reclassified + changed.deduplicated > 0) {
    flags.push(`final verifier changed ${changed.removed + changed.reclassified + changed.deduplicated} item(s)`);
  }
  if (flags.length > 0) flaggedEntries += 1;

  worksheet.push(
    `## ${sourceEntry.title}`,
    '',
    `- Entry: \`${result.entryId}\` (${sourceEntry.type})`,
    `- Card SHA-256: \`${finalCardSha256}\``,
    `- Source URL: ${sourceEntry.sourceUrl}`,
    `- Review: **${acceptanceRecord?.finalCardSha256 === finalCardSha256 ? 'ACCEPTED' : 'PENDING'}**`,
    `- Flags: ${flags.length > 0 ? flags.join('; ') : 'none'}`,
    '',
  );
  for (const { itemId, field, item } of items) {
    const evidence = item.evidenceQuotes.map(quote => `${sentenceIdByText.get(quote) ?? 'UNKNOWN'}: ${quote}`);
    worksheet.push(
      `### \`${itemId}\` · ${field}`,
      '',
      itemText(item),
      '',
      `- Item SHA-256: \`${sha256(JSON.stringify({ itemId, field, item }))}\``,
      ...evidence.map(quote => `- ${quote}`),
      '',
    );
  }
}

for (const entry of source.entries) {
  if (!seenIds.has(entry.id)) problems.push(`${entry.id}: missing from artifact`);
}
for (const label of overrides.labels ?? []) {
  if (!candidateFingerprintsByEntry.get(label.entryId)?.has(label.itemFingerprint)) {
    problems.push(`${label.entryId} ${label.itemId}: manual label candidate is absent from preserved extraction rounds`);
  }
  if (!coveredLabelFingerprintsByEntry.get(label.entryId)?.has(label.itemFingerprint)) {
    problems.push(`${label.entryId} ${label.itemId}: manual label was not scored as applicable`);
  }
}
for (const replacement of overrides.manualReplacements ?? []) {
  if (!candidateFingerprintsByEntry.get(replacement.entryId)?.has(replacement.replacesItemFingerprint)) {
    problems.push(`${replacement.entryId}: rejected one-sentence candidate is absent from preserved extraction rounds`);
  }
  if (!appliedReplacementFingerprintsByEntry.get(replacement.entryId)
    ?.has(replacement.replacesItemFingerprint)) {
    problems.push(`${replacement.entryId}: manual one-sentence replacement was not applied`);
  }
}
if (problems.length > 0) {
  throw new Error(`Corpus artifact failed ${problems.length} structural check(s):\n${compactProblems(problems)}`);
}

await writeFile(worksheetPath, `${worksheet.join('\n')}\n`, 'utf8');
console.log(`Audited ${artifact.entries.length} entries, ${itemCount} retained items, and ${evidenceCount} exact sentence references.`);
console.log(`Recorded ${artifact.manualOverrideCoverage.covered} manual labels, ${artifact.manualReplacementCoverage.covered} explicit replacement(s), and ${normalizationCount} deterministic verifier normalization(s).`);
console.log(`Manual acceptance matches ${acceptanceById.size}/${source.entries.length} final-card hashes.`);
console.log(`Mechanical attention flags: ${flaggedEntries}/${artifact.entries.length} entries.`);
console.log('Review worksheet: .source-cache/method-card-corpus-review.md');
