import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  candidateItemFingerprint,
  normalizeInferenceAdmissions,
  validateManualReplacementIdentities,
  validateReviewLabelIdentities,
} from './method-card-verification-policy.mjs';

const evidence = ['S001'];

describe('method-card verification policy', () => {
  it('validates a human label against its complete original candidate identity', () => {
    const candidate = {
      itemId: 'transferQuestions.0',
      currentField: 'transferQuestions',
      content: {
        question: 'What might participants examine?',
        rationale: 'The source identifies a tension worth examining.',
      },
      evidenceSentenceIds: ['S001', 'S002'],
    };
    const label = {
      itemId: candidate.itemId,
      itemText: candidate.content.question,
      itemFingerprint: candidateItemFingerprint(candidate),
      candidate,
    };

    assert.deepEqual(validateReviewLabelIdentities([label]), []);
    assert.deepEqual(
      validateReviewLabelIdentities([{ ...label, itemText: 'Different text' }]),
      ['labels.0: candidate content does not match itemText'],
    );
  });

  it('rejects duplicate active human-label fingerprints', () => {
    const candidate = {
      itemId: 'mechanisms.0',
      currentField: 'mechanisms',
      content: { claim: 'Members deliberate together.' },
      evidenceSentenceIds: ['S001'],
    };
    const label = {
      itemId: candidate.itemId,
      itemText: candidate.content.claim,
      itemFingerprint: candidateItemFingerprint(candidate),
      candidate,
    };

    assert.deepEqual(validateReviewLabelIdentities([label, label]), [
      'labels.1: duplicate active itemFingerprint',
    ]);
  });

  it('validates an explicit one-sentence replacement against both identities', () => {
    const replacesCandidate = {
      itemId: 'oneSentence',
      currentField: 'oneSentence',
      content: { claim: 'Rejected summary.' },
      evidenceSentenceIds: ['S001'],
    };
    const replacement = {
      itemId: 'oneSentence',
      currentField: 'oneSentence',
      content: { claim: 'Source-grounded summary.' },
      evidenceSentenceIds: ['S002'],
    };
    const record = {
      replacesItemFingerprint: candidateItemFingerprint(replacesCandidate),
      replacesCandidate,
      replacementFingerprint: candidateItemFingerprint(replacement),
      replacement,
    };

    assert.deepEqual(validateManualReplacementIdentities([record]), []);
    assert.deepEqual(
      validateManualReplacementIdentities([{ ...record, replacementFingerprint: '0'.repeat(64) }]),
      ['manualReplacements.0: replacement does not match replacementFingerprint'],
    );
  });

  it('downgrades a retained factual item when the rationale admits inference', () => {
    const decisions = [{
      itemId: 'enablingConditions.0',
      verdict: 'misclassified',
      targetField: 'problemContext',
      rationale: 'The source suggests this condition shaped the problem.',
      evidenceSentenceIds: evidence,
    }];
    const items = [{ itemId: 'enablingConditions.0', currentField: 'enablingConditions' }];

    const result = normalizeInferenceAdmissions(decisions, items);

    assert.deepEqual(result.normalizedDecisions[0], {
      ...decisions[0],
      verdict: 'unsupported',
      targetField: 'remove',
      evidenceSentenceIds: [],
    });
    assert.equal(result.normalizations.length, 1);
    assert.deepEqual(result.normalizations[0].originalDecision, decisions[0]);
  });

  it('does not alter an already unsupported decision', () => {
    const decisions = [{
      itemId: 'mechanisms.0',
      verdict: 'unsupported',
      targetField: 'remove',
      rationale: 'The source implies this mechanism but does not state it.',
      evidenceSentenceIds: [],
    }];

    const result = normalizeInferenceAdmissions(decisions, [
      { itemId: 'mechanisms.0', currentField: 'mechanisms' },
    ]);

    assert.deepEqual(result.normalizedDecisions, decisions);
    assert.deepEqual(result.normalizations, []);
  });

  it('preserves open transfer-question reasoning', () => {
    const decisions = [{
      itemId: 'transferQuestions.0',
      verdict: 'supported',
      targetField: 'transferQuestions',
      rationale: 'The source suggests an open question worth investigating.',
      evidenceSentenceIds: evidence,
    }];

    const result = normalizeInferenceAdmissions(decisions, [
      { itemId: 'transferQuestions.0', currentField: 'transferQuestions' },
    ]);

    assert.deepEqual(result.normalizedDecisions, decisions);
    assert.deepEqual(result.normalizations, []);
  });
});
