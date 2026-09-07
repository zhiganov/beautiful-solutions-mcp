import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, '.source-cache/toolbox-full.json');
const artifactPath = resolve(projectRoot, '.source-cache/method-cards-full.json');
const overridesPath = resolve(projectRoot, 'evaluation/method-card-corpus-overrides.json');
const acceptancePath = resolve(projectRoot, 'evaluation/method-card-corpus-acceptance.json');
const outputPath = resolve(projectRoot, 'src/data/method-cards.json');
const manifestPath = resolve(projectRoot, 'src/data/method-card-manifest.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runtimeCard(card) {
  const claims = field => card[field].map(item => item.claim);
  return {
    entryId: card.entryId,
    oneSentence: card.oneSentence.claim,
    purposes: claims('purposes'),
    problemContext: claims('problemContext'),
    mechanisms: claims('mechanisms'),
    actorsAndRoles: card.actorsAndRoles.map(({ actor, role }) => ({ actor, role })),
    enablingConditions: claims('enablingConditions'),
    constraints: claims('constraints'),
    tensions: claims('tensions'),
    observableSignals: claims('observableSignals'),
    transferQuestions: card.transferQuestions.map(({ question, rationale }) => ({ question, rationale })),
    searchConcepts: card.searchConcepts.map(item => item.label),
  };
}

const [sourceText, artifactText, overridesText, acceptanceText] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(artifactPath, 'utf8'),
  readFile(overridesPath, 'utf8'),
  readFile(acceptancePath, 'utf8'),
]);
const source = JSON.parse(sourceText);
const artifact = JSON.parse(artifactText);
const overrides = JSON.parse(overridesText);
const acceptance = JSON.parse(acceptanceText);
const resultById = new Map(artifact.entries.map(entry => [entry.entryId, entry]));
const acceptanceById = new Map(acceptance.entries.map(entry => [entry.entryId, entry]));
const problems = [];

if (artifact.schemaVersion !== 5 || artifact.mode !== 'full') {
  problems.push('artifact is not a schema-v5 full-corpus run');
}
if (artifact.sourceSha256 !== sha256(sourceText)) problems.push('artifact source hash mismatch');
if (artifact.manualOverridesSha256 !== sha256(overridesText)) problems.push('artifact override hash mismatch');
if (acceptance.sourceSha256 !== sha256(sourceText)) problems.push('acceptance source hash mismatch');
if (acceptance.manualOverridesSha256 !== sha256(overridesText)) problems.push('acceptance override hash mismatch');
if (source.entries.length !== 85 || artifact.entries.length !== source.entries.length) {
  problems.push(`expected 85 source and artifact entries, found ${source.entries.length} and ${artifact.entries.length}`);
}
if (
  artifact.manualOverrideCoverage?.covered !== overrides.labels?.length
  || artifact.manualOverrideCoverage?.uncovered?.length !== 0
) problems.push('artifact does not cover every manual label');
if (
  artifact.manualReplacementCoverage?.covered !== overrides.manualReplacements?.length
  || artifact.manualReplacementCoverage?.uncovered?.length !== 0
) problems.push('artifact does not cover every manual replacement');

const entries = source.entries.flatMap(sourceEntry => {
  const result = resultById.get(sourceEntry.id);
  const accepted = acceptanceById.get(sourceEntry.id);
  if (!result?.finalCard || result.status !== 'accepted') {
    problems.push(`${sourceEntry.id}: missing accepted final card`);
    return [];
  }
  const finalCardSha256 = sha256(JSON.stringify(result.finalCard));
  if (accepted?.status !== 'accepted' || accepted.finalCardSha256 !== finalCardSha256) {
    problems.push(`${sourceEntry.id}: final card is not covered by manual acceptance`);
    return [];
  }
  return [runtimeCard(result.finalCard)];
});

if (problems.length > 0) {
  throw new Error(`Method-card integration blocked:\n${problems.slice(0, 25).join('\n')}`);
}

const data = {
  schemaVersion: 1,
  work: source.work,
  sourceSha256: sha256(sourceText),
  acceptanceSha256: sha256(acceptanceText),
  license: {
    id: 'CC-BY-NC-SA-4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  changes: [
    'Extracted source-grounded method dimensions from complete entry write-ups at build time.',
    'Verified generated candidates semantically and applied fingerprinted human review decisions.',
    'Excluded complete write-ups and verification quotations from runtime data.',
  ],
  entries,
};
const dataText = `${JSON.stringify(data, null, 2)}\n`;
const manifest = {
  schemaVersion: 1,
  acceptedOn: acceptance.acceptedOn,
  entries: entries.length,
  sourceSha256: data.sourceSha256,
  acceptanceSha256: data.acceptanceSha256,
  methodCardsSha256: sha256(dataText),
};

await Promise.all([
  writeFile(outputPath, dataText, 'utf8'),
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
]);
console.log(`Integrated ${entries.length} accepted method cards without complete write-ups or verification quotations.`);
