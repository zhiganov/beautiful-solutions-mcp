import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.beautifultrouble.org/v2/en';
const INDEX_URL = `${API_BASE}/toolbox-lite-minisearch.json`;
const TOOLBOX_URL = 'https://beautifultrouble.org/toolbox/bsol';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(projectRoot, 'src/data');

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'beautiful-solutions-mcp-source-sync/0.1' },
  });
  if (!response.ok) {
    throw new Error(`Source request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function textList(value) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
    : [];
}

function normalizeType(value) {
  if (typeof value !== 'string') return 'unknown';
  return value.replace(/^bsol-/, '');
}

function normalizeRelated(related) {
  if (!related || typeof related !== 'object') return [];

  return Object.entries(related).flatMap(([type, items]) => {
    if (!Array.isArray(items)) return [];
    return items.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.tool !== 'string' || typeof item.title !== 'string') {
        return [];
      }
      return [{
        id: item.tool,
        type: normalizeType(type),
        title: item.title.trim(),
        summary: optionalText(item.snapshot),
        sourceUrl: `https://beautifultrouble.org/toolbox/tool/${item.tool}`,
      }];
    });
  });
}

function normalizeReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.title !== 'string') return [];
    return [{
      type: optionalText(item.type),
      title: item.title.trim(),
      url: optionalText(item.link),
      note: optionalText(item.text),
    }];
  });
}

function normalizeEntry(slug, entry, indexEntry) {
  if (!entry || typeof entry !== 'object') throw new Error(`${slug}: expected an object`);
  if (entry.slug !== slug) throw new Error(`${slug}: source slug mismatch (${entry.slug})`);
  if (typeof entry.title !== 'string' || !entry.title.trim()) throw new Error(`${slug}: missing title`);
  if (typeof entry.type !== 'string' || !entry.type.startsWith('bsol-')) {
    throw new Error(`${slug}: unexpected type (${entry.type})`);
  }

  const epigraphs = Array.isArray(entry.epigraphs)
    ? entry.epigraphs.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.quote !== 'string') return [];
      return [{ quote: item.quote.trim(), attribution: optionalText(item.attribution) }];
    })
    : [];

  return {
    id: slug,
    type: normalizeType(entry.type),
    title: entry.title.trim(),
    sector: optionalText(entry.sector),
    summary: optionalText(entry.snapshot) ?? optionalText(indexEntry?.snapshot) ?? '',
    authors: textList(entry.authors),
    authorBio: optionalText(entry.authors_bio),
    guides: textList(entry.guides),
    guidesRole: optionalText(entry.guides_role),
    guidesBio: optionalText(entry.guides_bio),
    epigraphs,
    pullQuote: optionalText(entry.pull_quote),
    references: normalizeReferences(entry.learn_more),
    related: normalizeRelated(entry.related),
    sourceUrl: `https://beautifultrouble.org/toolbox/tool/${slug}`,
    sourceLastModified: typeof entry.lastmod === 'number' ? entry.lastmod : undefined,
  };
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let next = 0;

  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function main() {
  const index = await getJson(INDEX_URL);
  if (!index.tools || typeof index.tools !== 'object') {
    throw new Error('Official index did not contain a tools object');
  }

  const slugs = Object.entries(index.tools)
    .filter(([, entry]) => entry && typeof entry === 'object' && String(entry.type).startsWith('bsol-'))
    .map(([slug]) => slug)
    .sort();

  if (slugs.length === 0) throw new Error('Official index contained no Beautiful Solutions entries');

  const entries = await mapWithConcurrency(slugs, 6, async slug => {
    const source = await getJson(`${API_BASE}/${slug}.json`);
    return normalizeEntry(slug, source, index.tools[slug]);
  });
  entries.sort((a, b) => a.title.localeCompare(b.title, 'en'));

  const countsByType = Object.fromEntries(
    [...new Set(entries.map(entry => entry.type))]
      .sort()
      .map(type => [type, entries.filter(entry => entry.type === type).length]),
  );
  const sectors = [...new Set(entries.map(entry => entry.sector).filter(Boolean))].sort();
  const payload = {
    schemaVersion: 2,
    work: 'Beautiful Solutions: A Toolbox for Liberation',
    language: 'en',
    entries,
  };
  const payloadText = `${JSON.stringify(payload, null, 2)}\n`;
  const payloadHash = createHash('sha256').update(payloadText).digest('hex');
  const manifest = {
    schemaVersion: 2,
    retrievedAt: new Date().toISOString(),
    source: {
      work: payload.work,
      publicationYear: 2024,
      editors: ['Elandria Williams', 'Rachel Plattus', 'Eli Feghali', 'Nathan Schneider'],
      organization: 'Beautiful Trouble',
      toolboxUrl: TOOLBOX_URL,
      apiIndexUrl: INDEX_URL,
    },
    selection: 'English API entries whose source type begins with bsol-. Source-authored snapshots and structural metadata retained; full write-ups, images, and image captions excluded.',
    changes: [
      'Reshaped source fields into a stable JSON schema.',
      'Normalized line endings and trimmed surrounding whitespace.',
      'Converted relationship keys into normalized types and canonical source URLs.',
      'Excluded full entry write-ups; retained concise source-authored snapshots and canonical links for reading the complete entries.',
      'Excluded images and image captions.',
    ],
    license: {
      id: 'CC-BY-NC-SA-4.0',
      name: 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International',
      url: LICENSE_URL,
      statementUrl: TOOLBOX_URL,
    },
    inventory: {
      entries: entries.length,
      countsByType,
      sectors,
    },
    toolboxSha256: payloadHash,
  };

  await mkdir(dataDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(dataDir, 'toolbox.json'), payloadText, 'utf8'),
    writeFile(resolve(dataDir, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  ]);

  console.log(`Synced ${entries.length} entries (${Object.entries(countsByType).map(([type, count]) => `${count} ${type}`).join(', ')}).`);
  console.log(`Toolbox SHA-256: ${payloadHash}`);
}

await main();
