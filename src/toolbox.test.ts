import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SOURCE_MANIFEST, TOOLBOX } from './data.js';
import {
  buildDiscussionGuide,
  compareEntries,
  getEntry,
  getRelatedEntries,
  getSourceInfo,
  mapChallenge,
  searchToolbox,
} from './toolbox.js';

describe('source snapshot', () => {
  it('contains the complete validated English inventory', () => {
    assert.equal(TOOLBOX.entries.length, 85);
    assert.deepEqual(SOURCE_MANIFEST.inventory.countsByType, {
      principle: 10,
      question: 8,
      solution: 27,
      story: 32,
      value: 8,
    });
    assert.ok(TOOLBOX.entries.every(entry => entry.id && entry.title && entry.body && entry.sourceUrl));
    const ids = new Set(TOOLBOX.entries.map(entry => entry.id));
    assert.ok(TOOLBOX.entries.every(entry => entry.related.every(related => ids.has(related.id))));
    assert.doesNotMatch(JSON.stringify(TOOLBOX), /"image(?:_caption)?"|squarespace-cdn/i);
  });

  it('matches the structural integrity hash in the manifest', () => {
    const bytes = readFileSync(new URL('./data/toolbox.json', import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCE_MANIFEST.toolboxSha256);
    assert.equal(getSourceInfo().result.integrity.matches, true);
  });
});

describe('reference tools', () => {
  it('finds community land trusts for a collective housing challenge', () => {
    const response = searchToolbox('collective ownership affordable housing');
    assert.ok(response.result.entries.slice(0, 5).some(entry => entry.id === 'bsol-community-land-trust'));
    assert.equal(response.result.entries[0]?.id, 'bsol-limited-equity-housing-cooperatives');
    assert.equal(response.attribution.license, 'CC-BY-NC-SA-4.0');
  });

  it('returns full entry provenance and source-authored relationships', () => {
    const response = getEntry('bsol-community-land-trust');
    assert.deepEqual(response.result.authors, ['May Louie', 'Sharon Cho']);
    assert.match(response.result.sourceUrl, /beautifultrouble\.org/);

    const related = getRelatedEntries('bsol-community-land-trust', 'principle');
    assert.ok(related.result.related.some(entry => entry.id === 'bsol-democratize-ownership'));
  });
});

describe('praxis tools', () => {
  it('maps a challenge across multiple source lenses without claiming recommendation', () => {
    const response = mapChallenge('community ownership of housing and land');
    assert.match(response.result.caution, /not recommendations/i);
    assert.ok(response.result.lenses.solution.length > 0);
    assert.ok(response.result.lenses.principle.length > 0);
  });

  it('compares source fields and builds a clearly labelled generated guide', () => {
    const compared = compareEntries([
      'bsol-community-land-trust',
      'bsol-limited-equity-housing-cooperatives',
    ]);
    assert.equal(compared.result.entries.length, 2);
    assert.match(compared.result.note, /does not rank/i);

    const guide = buildDiscussionGuide(
      ['bsol-community-land-trust'],
      'neighborhood housing coalition',
    );
    assert.match(guide.result.generatedNotice, /not quotations/i);
    assert.equal(guide.result.readings[0]?.id, 'bsol-community-land-trust');
    assert.ok(guide.result.flow.length >= 4);
  });
});
