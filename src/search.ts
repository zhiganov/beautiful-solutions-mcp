import type { EntryType, ToolboxEntry } from './types.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'how',
  'i', 'in', 'is', 'it', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'to',
  'we', 'what', 'when', 'where', 'which', 'who', 'with', 'you', 'your',
]);

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokenize(value: string): string[] {
  return [...new Set(
    normalize(value)
      .split(/\s+/)
      .filter(token => token.length > 1 && !STOP_WORDS.has(token))
      .map(stem),
  )];
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

export interface SearchFilters {
  type?: EntryType;
  sector?: string;
  limit?: number;
  relatedBoostIds?: Set<string>;
}

export interface SearchResult {
  entry: ToolboxEntry;
  score: number;
  matchedFields: string[];
}

export function searchEntries(entries: ToolboxEntry[], query: string, filters: SearchFilters = {}): SearchResult[] {
  const queryTokens = tokenize(query);
  const normalizedQuery = normalize(query);
  if (queryTokens.length === 0) return [];

  const candidates = entries.filter(entry => {
    if (filters.type && entry.type !== filters.type) return false;
    if (filters.sector && normalize(entry.sector ?? '') !== normalize(filters.sector)) return false;
    return true;
  });

  const results = candidates.flatMap(entry => {
    const fields = {
      title: tokenSet(entry.title),
      sector: tokenSet(entry.sector ?? ''),
      summary: tokenSet(entry.summary),
      people: tokenSet([...entry.authors, ...entry.guides].join(' ')),
      related: tokenSet(entry.related.map(item => `${item.title} ${item.summary ?? ''}`).join(' ')),
    };
    const weights: Record<keyof typeof fields, number> = {
      title: 8,
      sector: 5,
      summary: 4,
      people: 2,
      related: 2,
    };
    let score = 0;
    const matchedFields: string[] = [];

    for (const [fieldName, tokens] of Object.entries(fields) as [keyof typeof fields, Set<string>][]) {
      const matches = queryTokens.filter(token => tokens.has(token));
      if (matches.length > 0) {
        score += matches.length * weights[fieldName];
        matchedFields.push(fieldName);
      }
    }

    const normalizedTitle = normalize(entry.title);
    const normalizedSummary = normalize(entry.summary);
    if (normalizedQuery.length > 2 && normalizedTitle.includes(normalizedQuery)) score += 14;
    else if (normalizedQuery.length > 4 && normalizedSummary.includes(normalizedQuery)) score += 6;

    if (filters.relatedBoostIds?.has(entry.id)) {
      score += 6;
      matchedFields.push('source_relationship');
    }

    return score > 0 ? [{ entry, score, matchedFields: [...new Set(matchedFields)] }] : [];
  });

  return results
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'en'))
    .slice(0, filters.limit ?? 10);
}
