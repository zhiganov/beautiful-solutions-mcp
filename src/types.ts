export const ENTRY_TYPES = ['value', 'principle', 'question', 'solution', 'story'] as const;
export type EntryType = typeof ENTRY_TYPES[number];

export interface Epigraph {
  quote: string;
  attribution?: string;
}

export interface Reference {
  type?: string;
  title: string;
  url?: string;
  note?: string;
}

export interface RelatedEntry {
  id: string;
  type: string;
  title: string;
  summary?: string;
  sourceUrl: string;
}

export interface ToolboxEntry {
  id: string;
  type: EntryType;
  title: string;
  sector?: string;
  summary: string;
  authors: string[];
  authorBio?: string;
  guides: string[];
  guidesRole?: string;
  guidesBio?: string;
  epigraphs: Epigraph[];
  pullQuote?: string;
  references: Reference[];
  related: RelatedEntry[];
  sourceUrl: string;
  sourceLastModified?: number;
}

export interface ToolboxData {
  schemaVersion: number;
  work: string;
  language: string;
  entries: ToolboxEntry[];
}

export interface SourceManifest {
  schemaVersion: number;
  retrievedAt: string;
  source: {
    work: string;
    publicationYear: number;
    editors: string[];
    organization: string;
    toolboxUrl: string;
    apiIndexUrl: string;
  };
  selection: string;
  changes: string[];
  license: {
    id: string;
    name: string;
    url: string;
    statementUrl: string;
  };
  inventory: {
    entries: number;
    countsByType: Record<EntryType, number>;
    sectors: string[];
  };
  toolboxSha256: string;
}
