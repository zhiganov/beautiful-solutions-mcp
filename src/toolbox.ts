import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ATTRIBUTION,
  METHOD_CARD_MANIFEST,
  METHOD_CARDS,
  SOURCE_MANIFEST,
  TOOLBOX,
  attributed,
} from './data.js';
import { searchEntries, tokenize } from './search.js';
import type { EntryType, RuntimeToolboxEntry } from './types.js';

const methodCardById = new Map(METHOD_CARDS.entries.map(card => [card.entryId, card]));
const entries: RuntimeToolboxEntry[] = TOOLBOX.entries.map(entry => {
  const methodCard = methodCardById.get(entry.id);
  if (!methodCard) throw new Error(`Runtime method-card snapshot is missing ${entry.id}.`);
  return { ...entry, methodCard };
});
if (methodCardById.size !== TOOLBOX.entries.length) {
  throw new Error('Runtime method-card snapshot does not cover the complete toolbox.');
}
const byId = new Map(entries.map(entry => [entry.id, entry]));

function compact(entry: RuntimeToolboxEntry) {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    sector: entry.sector,
    summary: entry.summary,
    authors: entry.authors,
    methodSummary: entry.methodCard.oneSentence,
    sourceUrl: entry.sourceUrl,
  };
}

function requireEntry(id: string): RuntimeToolboxEntry {
  const entry = byId.get(id);
  if (!entry) {
    const close = searchEntries(entries, id.replace(/^bsol-/, '').replaceAll('-', ' '), { limit: 5 });
    const suggestions = close.map(result => `${result.entry.id} — ${result.entry.title}`).join('\n');
    throw new Error(`Entry "${id}" not found.${suggestions ? `\nClosest entries:\n${suggestions}` : ''}`);
  }
  return entry;
}

export function listEntries(filters: { type?: EntryType; sector?: string; limit?: number } = {}) {
  const sector = filters.sector?.toLocaleLowerCase('en');
  const filtered = entries.filter(entry =>
    (!filters.type || entry.type === filters.type)
    && (!sector || entry.sector?.toLocaleLowerCase('en') === sector),
  );
  return attributed({
    count: filtered.length,
    entries: filtered.slice(0, filters.limit ?? entries.length).map(compact),
    availableTypes: SOURCE_MANIFEST.inventory.countsByType,
    availableSectors: SOURCE_MANIFEST.inventory.sectors,
  });
}

export function searchToolbox(query: string, filters: { type?: EntryType; sector?: string; limit?: number } = {}) {
  const results = searchEntries(entries, query, filters);
  return attributed({
    query,
    note: 'Scores reflect deterministic token matches over source fields and reviewed method cards, with a small solar/renewable synonym bridge; they are not evidence that an entry will fit a particular context.',
    count: results.length,
    entries: results.map(({ entry, score, matchedFields, matchedTokens }) => ({
      ...compact(entry),
      score,
      matchedFields,
      matchedTokens,
    })),
  });
}

export function getEntry(id: string) {
  const entry = requireEntry(id);
  return attributed({
    ...entry,
    methodCardNotice: 'The method card is an adapted, manually reviewed synthesis grounded in the source. It is not a source quotation, recommendation, or claim of local applicability.',
    readingBoundary: 'This record contains a concise source-authored summary, structural metadata, and an adapted method card—not the complete entry text. Use sourceUrl to read the full entry.',
  });
}

export function getRelatedEntries(id: string, type?: EntryType) {
  const entry = requireEntry(id);
  const related = entry.related
    .filter(item => !type || item.type === type)
    .map(item => {
      const full = byId.get(item.id);
      return full ? { ...compact(full), relationshipSource: entry.sourceUrl } : { ...item, availableInSnapshot: false };
    });
  return attributed({
    entry: compact(entry),
    note: 'Relationships are supplied by the Beautiful Trouble source API; this server does not infer them.',
    count: related.length,
    related,
  });
}

export function mapChallenge(challenge: string, options: { sector?: string; maxPerType?: number } = {}) {
  const minDirectMatches = tokenize(challenge).length >= 4 ? 2 : 1;
  const seedResults = searchEntries(entries, challenge, {
    sector: options.sector,
    limit: 5,
    minDirectMatches,
  });
  const relatedBoostIds = new Set(seedResults.flatMap(result => result.entry.related.map(item => item.id)));
  const maxPerType = options.maxPerType ?? 3;
  const lenses = Object.fromEntries(
    (['question', 'value', 'principle', 'solution', 'story'] as EntryType[]).map(type => {
      const matches = searchEntries(entries, challenge, {
        type,
        sector: type === 'solution' || type === 'story' ? options.sector : undefined,
        limit: maxPerType,
        relatedBoostIds,
        minDirectMatches,
      });
      return [type, matches.map(({ entry, score, matchedFields, matchedTokens }) => ({
        ...compact(entry),
        score,
        matchedFields,
        matchedTokens,
      }))];
    }),
  );

  return attributed({
    challenge,
    sector: options.sector,
    method: 'Weighted token matching over source fields and reviewed method cards, with a small solar/renewable synonym bridge and a visible boost for relationships attached to the five strongest direct matches.',
    caution: 'These are exploration leads, not recommendations. Test relevance with people in the affected context.',
    lenses,
  });
}

export function compareEntries(ids: string[]) {
  const selected = [...new Set(ids)].map(requireEntry);
  return attributed({
    note: 'This matrix exposes source fields for comparison; it does not rank or declare a best model.',
    entries: selected.map(entry => ({
      ...compact(entry),
      epigraphs: entry.epigraphs,
      pullQuote: entry.pullQuote,
      references: entry.references,
      methodCard: entry.methodCard,
      relatedCounts: Object.fromEntries(
        (['value', 'principle', 'question', 'solution', 'story'] as EntryType[])
          .map(type => [type, entry.related.filter(item => item.type === type).length]),
      ),
    })),
  });
}

function uniqueCompact(items: RuntimeToolboxEntry[]) {
  return [...new Map(items.map(item => [item.id, item])).values()].map(compact);
}

function contextualLenses(candidates: RuntimeToolboxEntry[], type: EntryType, context?: string) {
  const selectedType = candidates.filter(entry => entry.type === type);
  if (!context) return uniqueCompact(selectedType).slice(0, 5);
  return searchEntries(selectedType, context, { limit: 5 }).map(({ entry }) => compact(entry));
}

export function buildDiscussionGuide(ids: string[], context?: string) {
  const selected = [...new Set(ids)].map(requireEntry);
  const linked = selected.flatMap(entry => entry.related.map(item => byId.get(item.id)).filter(Boolean) as RuntimeToolboxEntry[]);
  const questionCandidates = [
    ...selected.filter(entry => entry.type === 'question'),
    ...linked.filter(entry => entry.type === 'question'),
  ];
  const valueCandidates = [
    ...selected.filter(entry => entry.type === 'value'),
    ...linked.filter(entry => entry.type === 'value'),
  ];
  const questions = contextualLenses(questionCandidates, 'question', context);
  const values = contextualLenses(valueCandidates, 'value', context);
  const lensPrompts = [
    ...questions.map(entry => entry.title),
    ...values.map(entry => `How would “${entry.title}” change the choices we make?`),
  ];
  const methodQuestions = selected.flatMap(entry =>
    entry.methodCard.transferQuestions.slice(0, 2).map(item => ({
      entryId: entry.id,
      entryTitle: entry.title,
      ...item,
      sourceUrl: entry.sourceUrl,
    }))).slice(0, 8);

  return attributed({
    title: 'Beautiful Solutions discussion scaffold',
    context,
    generatedNotice: 'Generic flow and value-lens prompts are original runtime scaffolding; they are not quotations from the book.',
    methodCardNotice: 'Method cards and transfer questions are adapted, manually reviewed syntheses grounded in the source; they are not source quotations or recommendations.',
    lensNotice: 'Source-linked questions and values are included only when their own title or summary matches the supplied context. Empty lists mean no contextual source match was found.',
    readings: selected.map(entry => ({ ...compact(entry), methodCard: entry.methodCard })),
    sourceLinkedQuestions: questions,
    sourceLinkedValues: values,
    adaptedTransferQuestions: methodQuestions,
    flow: [
      {
        phase: 'Locate the challenge',
        prompts: [
          context
            ? `What do current arrangements fail to provide in this context: ${context}?`
            : 'What does our context need that current arrangements do not provide?',
          'Who experiences the problem most directly, and whose knowledge is missing from the room?',
        ],
      },
      {
        phase: 'Read the examples closely',
        prompts: selected.map(entry => `What conditions, relationships, and power shifts make “${entry.title}” possible?`),
      },
      {
        phase: 'Interrogate transfer',
        prompts: methodQuestions.length > 0
          ? methodQuestions.map(item => item.question)
          : [
            'Which parts appear transferable, and which depend on a history or place we do not share?',
            'What harms could come from copying the form without the underlying relationships?',
          ],
      },
      ...(lensPrompts.length > 0 ? [{
        phase: 'Use the toolbox lenses',
        prompts: lensPrompts,
      }] : []),
      {
        phase: 'Choose a learning step',
        prompts: [
          'What is the smallest reversible experiment that would teach us something useful?',
          'Who should shape, govern, and evaluate that experiment?',
        ],
      },
    ],
  });
}

export function getSourceInfo() {
  const dataText = readFileSync(new URL('./data/toolbox.json', import.meta.url));
  const methodCardsText = readFileSync(new URL('./data/method-cards.json', import.meta.url));
  const actualHash = createHash('sha256').update(dataText).digest('hex');
  const actualMethodCardsHash = createHash('sha256').update(methodCardsText).digest('hex');
  return attributed({
    ...SOURCE_MANIFEST,
    methodCardAdaptation: {
      entries: METHOD_CARDS.entries.length,
      license: METHOD_CARDS.license,
      changes: METHOD_CARDS.changes,
    },
    integrity: {
      toolbox: {
        expectedSha256: SOURCE_MANIFEST.toolboxSha256,
        actualSha256: actualHash,
        matches: actualHash === SOURCE_MANIFEST.toolboxSha256,
      },
      methodCards: {
        expectedSha256: METHOD_CARD_MANIFEST.methodCardsSha256,
        actualSha256: actualMethodCardsHash,
        matches: actualMethodCardsHash === METHOD_CARD_MANIFEST.methodCardsSha256,
        acceptedOn: METHOD_CARD_MANIFEST.acceptedOn,
        entries: METHOD_CARD_MANIFEST.entries,
      },
    },
    limitations: [
      'English entries only.',
      'The snapshot contains concise source-authored summaries and structural metadata, not complete entry write-ups.',
      'Method cards are adapted, manually reviewed syntheses; build-time verification quotations are excluded from runtime data.',
      'Images are excluded because image permissions may differ.',
      'Search relevance is lexical and deterministic, not semantic or prescriptive.',
      'CC BY-NC-SA 4.0 prohibits commercial use without separate permission.',
    ],
    attributionExample: ATTRIBUTION,
  });
}
