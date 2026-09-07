import { createHash } from 'node:crypto';

const inferenceAdmissionPattern = /\b(?:imply|implies|implied|suggest|suggests|suggested|indicate|indicates|indicated|indicating)\b/i;

export function candidateItemText(item) {
  if (item.content.claim) return item.content.claim;
  if (item.content.question) return item.content.question;
  if (item.content.label) return item.content.label;
  return `${item.content.actor}: ${item.content.role}`;
}

export function candidateItemFingerprint(item) {
  return createHash('sha256').update(JSON.stringify(item)).digest('hex');
}

export function validateReviewLabelIdentities(labels) {
  const problems = [];
  const seenFingerprints = new Set();
  for (const [index, label] of labels.entries()) {
    const path = `labels.${index}`;
    if (label.candidate.itemId !== label.itemId) {
      problems.push(`${path}: candidate itemId does not match itemId`);
    }
    if (candidateItemText(label.candidate) !== label.itemText) {
      problems.push(`${path}: candidate content does not match itemText`);
    }
    if (candidateItemFingerprint(label.candidate) !== label.itemFingerprint) {
      problems.push(`${path}: candidate content does not match itemFingerprint`);
    }
    if (seenFingerprints.has(label.itemFingerprint)) {
      problems.push(`${path}: duplicate active itemFingerprint`);
    }
    seenFingerprints.add(label.itemFingerprint);
  }
  return problems;
}

export function validateManualReplacementIdentities(replacements) {
  const problems = [];
  const seenReplacedFingerprints = new Set();
  for (const [index, record] of replacements.entries()) {
    const path = `manualReplacements.${index}`;
    if (record.replacesCandidate.itemId !== 'oneSentence'
      || record.replacesCandidate.currentField !== 'oneSentence'
      || !record.replacesCandidate.content.claim) {
      problems.push(`${path}: replacesCandidate must identify oneSentence`);
    }
    if (candidateItemFingerprint(record.replacesCandidate) !== record.replacesItemFingerprint) {
      problems.push(`${path}: replacesCandidate does not match replacesItemFingerprint`);
    }
    if (record.replacement.itemId !== 'oneSentence'
      || record.replacement.currentField !== 'oneSentence'
      || !record.replacement.content.claim) {
      problems.push(`${path}: replacement must identify oneSentence`);
    }
    if (candidateItemFingerprint(record.replacement) !== record.replacementFingerprint) {
      problems.push(`${path}: replacement does not match replacementFingerprint`);
    }
    if (record.replacementFingerprint === record.replacesItemFingerprint) {
      problems.push(`${path}: replacement must differ from the rejected candidate`);
    }
    const replacedIdentity = `${record.entryId}\n${record.replacesItemFingerprint}`;
    if (seenReplacedFingerprints.has(replacedIdentity)) {
      problems.push(`${path}: duplicate replacesItemFingerprint`);
    }
    seenReplacedFingerprints.add(replacedIdentity);
  }
  return problems;
}

export function normalizeInferenceAdmissions(decisions, items) {
  const itemById = new Map(items.map(item => [item.itemId, item]));
  const normalizations = [];
  const normalizedDecisions = decisions.map(decision => {
    const item = itemById.get(decision.itemId);
    const admitsInference = decision.verdict !== 'unsupported'
      && item?.currentField !== 'transferQuestions'
      && inferenceAdmissionPattern.test(decision.rationale);
    if (!admitsInference) return decision;

    const normalized = {
      ...decision,
      verdict: 'unsupported',
      targetField: 'remove',
      evidenceSentenceIds: [],
    };
    normalizations.push({
      itemId: decision.itemId,
      reason: 'Verifier rationale admitted an inference; deterministic policy downgraded the item to unsupported.',
      originalDecision: decision,
      normalizedDecision: normalized,
    });
    return normalized;
  });

  return { normalizedDecisions, normalizations };
}
