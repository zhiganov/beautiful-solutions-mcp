import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ATTRIBUTION, SOURCE_MANIFEST, TOOLBOX, attributed } from './data.js';
import { searchEntries } from './search.js';
import type { EntryType, ToolboxEntry } from './types.js';

const entries = TOOLBOX.entries;
const byId = new Map(entries.map(entry => [entry.id, entry]));

function compact(entry: ToolboxEntry) {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    sector: entry.sector,
    summary: entry.summary,
    authors: entry.authors,
    sourceUrl: entry.sourceUrl,
  };
}

function requireEntry(id: string): ToolboxEntry {
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
    note: 'Scores reflect deterministic lexical matches, not evidence that an entry will fit a particular context.',
    count: results.length,
    entries: results.map(({ entry, score, matchedFields }) => ({
      ...compact(entry),
      score,
      matchedFields,
    })),
  });
}

export function getEntry(id: string) {
  const entry = requireEntry(id);
  return attributed({
    ...entry,
    readingBoundary: 'This record contains a concise source-authored summary and structural metadata, not the complete entry text. Use sourceUrl to read the full entry.',
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
  const seedResults = searchEntries(entries, challenge, { sector: options.sector, limit: 5 });
  const relatedBoostIds = new Set(seedResults.flatMap(result => result.entry.related.map(item => item.id)));
  const maxPerType = options.maxPerType ?? 3;
  const lenses = Object.fromEntries(
    (['question', 'value', 'principle', 'solution', 'story'] as EntryType[]).map(type => {
      const matches = searchEntries(entries, challenge, {
        type,
        sector: type === 'solution' || type === 'story' ? options.sector : undefined,
        limit: maxPerType,
        relatedBoostIds,
      });
      return [type, matches.map(({ entry, score, matchedFields }) => ({
        ...compact(entry),
        score,
        matchedFields,
      }))];
    }),
  );

  return attributed({
    challenge,
    sector: options.sector,
    method: 'Weighted lexical matching, with a visible boost for relationships attached to the five strongest lexical matches.',
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
      relatedCounts: Object.fromEntries(
        (['value', 'principle', 'question', 'solution', 'story'] as EntryType[])
          .map(type => [type, entry.related.filter(item => item.type === type).length]),
      ),
    })),
  });
}

function uniqueCompact(items: ToolboxEntry[]) {
  return [...new Map(items.map(item => [item.id, item])).values()].map(compact);
}

export function buildDiscussionGuide(ids: string[], context?: string) {
  const selected = [...new Set(ids)].map(requireEntry);
  const linked = selected.flatMap(entry => entry.related.map(item => byId.get(item.id)).filter(Boolean) as ToolboxEntry[]);
  const questions = uniqueCompact([
    ...selected.filter(entry => entry.type === 'question'),
    ...linked.filter(entry => entry.type === 'question'),
  ]).slice(0, 5);
  const values = uniqueCompact([
    ...selected.filter(entry => entry.type === 'value'),
    ...linked.filter(entry => entry.type === 'value'),
  ]).slice(0, 5);

  return attributed({
    title: 'Beautiful Solutions discussion scaffold',
    context,
    generatedNotice: 'Prompts below are original scaffolding generated from selected source titles and relationships; they are not quotations from the book.',
    readings: selected.map(compact),
    sourceLinkedQuestions: questions,
    sourceLinkedValues: values,
    flow: [
      {
        phase: 'Locate the challenge',
        prompts: [
          `What does ${context ? `the ${context} context` : 'our context'} need that current arrangements do not provide?`,
          'Who experiences the problem most directly, and whose knowledge is missing from the room?',
        ],
      },
      {
        phase: 'Read the examples closely',
        prompts: selected.map(entry => `What conditions, relationships, and power shifts make “${entry.title}” possible?`),
      },
      {
        phase: 'Interrogate transfer',
        prompts: [
          'Which parts appear transferable, and which depend on a history or place we do not share?',
          'What harms could come from copying the form without the underlying relationships?',
        ],
      },
      {
        phase: 'Use the toolbox lenses',
        prompts: [
          ...questions.map(entry => entry.title),
          ...values.map(entry => `How would “${entry.title}” change the choices we make?`),
        ],
      },
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
  const actualHash = createHash('sha256').update(dataText).digest('hex');
  return attributed({
    ...SOURCE_MANIFEST,
    integrity: {
      expectedSha256: SOURCE_MANIFEST.toolboxSha256,
      actualSha256: actualHash,
      matches: actualHash === SOURCE_MANIFEST.toolboxSha256,
    },
    limitations: [
      'English entries only.',
      'The snapshot contains concise source-authored summaries and structural metadata, not complete entry write-ups.',
      'Images are excluded because image permissions may differ.',
      'Search relevance is lexical and deterministic, not semantic or prescriptive.',
      'CC BY-NC-SA 4.0 prohibits commercial use without separate permission.',
    ],
    attributionExample: ATTRIBUTION,
  });
}
