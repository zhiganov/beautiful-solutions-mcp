import type { EntryType, ToolboxEntry } from './types.js';

const STOP_WORDS = new Set([
  'a', 'all', 'also', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can',
  'could', 'do', 'for', 'from', 'get', 'give', 'have', 'how', 'i', 'in', 'is',
  'it', 'keep', 'many', 'more', 'most', 'much', 'need', 'of', 'on', 'or', 'our',
  'over', 'rather', 'should', 'than', 'that', 'the', 'their', 'they', 'to',
  'under', 'us', 'want', 'wants', 'way', 'we', 'what', 'when', 'where', 'which',
  'who', 'will', 'with', 'would', 'you', 'your',
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
  minDirectMatches?: number;
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
    const directFields = {
      title: tokenSet(entry.title),
      summary: tokenSet(entry.summary),
      people: tokenSet([...entry.authors, ...entry.guides].join(' ')),
    };
    const contextualFields = {
      sector: tokenSet(entry.sector ?? ''),
      related: tokenSet(entry.related.map(item => `${item.title} ${item.summary ?? ''}`).join(' ')),
    };
    const directWeights: Record<keyof typeof directFields, number> = {
      title: 8,
      summary: 4,
      people: 2,
    };
    const contextualWeights: Record<keyof typeof contextualFields, number> = {
      sector: 5,
      related: 2,
    };
    let score = 0;
    const matchedFields: string[] = [];
    const directMatchedTokens = new Set<string>();

    for (const [fieldName, tokens] of Object.entries(directFields) as [keyof typeof directFields, Set<string>][]) {
      const matches = queryTokens.filter(token => tokens.has(token));
      if (matches.length > 0) {
        score += matches.length * directWeights[fieldName];
        matchedFields.push(fieldName);
        matches.forEach(token => directMatchedTokens.add(token));
      }
    }

    const normalizedTitle = normalize(entry.title);
    const normalizedSummary = normalize(entry.summary);
    if (normalizedQuery.length > 2 && normalizedTitle.includes(normalizedQuery)) score += 14;
    else if (normalizedQuery.length > 4 && normalizedSummary.includes(normalizedQuery)) score += 6;

    if (directMatchedTokens.size < (filters.minDirectMatches ?? 1)) return [];

    for (const [fieldName, tokens] of Object.entries(contextualFields) as [keyof typeof contextualFields, Set<string>][]) {
      const matches = queryTokens.filter(token => tokens.has(token));
      if (matches.length > 0) {
        score += matches.length * contextualWeights[fieldName];
        matchedFields.push(fieldName);
      }
    }

    if (filters.relatedBoostIds?.has(entry.id)) {
      score += 6;
      matchedFields.push('source_relationship');
    }

    return [{ entry, score, matchedFields: [...new Set(matchedFields)] }];
  });

  return results
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'en'))
    .slice(0, filters.limit ?? 10);
}
