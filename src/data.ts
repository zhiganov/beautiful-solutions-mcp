import { readFileSync } from 'node:fs';
import type { SourceManifest, ToolboxData } from './types.js';

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

export const TOOLBOX = readJson<ToolboxData>('./data/toolbox.json');
export const SOURCE_MANIFEST = readJson<SourceManifest>('./data/source-manifest.json');

export const ATTRIBUTION = {
  work: SOURCE_MANIFEST.source.work,
  editors: SOURCE_MANIFEST.source.editors,
  organization: SOURCE_MANIFEST.source.organization,
  source: SOURCE_MANIFEST.source.toolboxUrl,
  license: SOURCE_MANIFEST.license.id,
  licenseUrl: SOURCE_MANIFEST.license.url,
  changes: SOURCE_MANIFEST.changes,
  endorsement: 'Independent adaptation; not endorsed by Beautiful Trouble or the editors or contributors.',
};

export function attributed<T>(result: T) {
  return { result, attribution: ATTRIBUTION };
}
