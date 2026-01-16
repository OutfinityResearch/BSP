import {
  parseTestLine,
  softmaxFromLogits,
  stableTopKFromMap,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

const EPS = 1e-12;

function normalizeExpectedDistribution(expected) {
  if (!Array.isArray(expected)) {
    throw new Error('Divergence expected_json must be a JSON array');
  }
  const dist = [];
  for (const item of expected) {
    if (!item || typeof item !== 'object') continue;
    const outcome = String(item.outcome);
    const p = Number(item.p);
    if (!Number.isFinite(p) || p < 0) continue;
    dist.push({ outcome, p });
  }
  const sum = dist.reduce((acc, d) => acc + d.p, 0);
  if (sum <= 0) {
    throw new Error('Divergence expected_json distribution has zero total probability');
  }
  return dist.map((d) => ({ outcome: d.outcome, p: d.p / sum }));
}

export function score({ engine, prompt, expected, meta, options }) {
  const dist = normalizeExpectedDistribution(expected);

  const { tokenScores } = predictTopTokens(engine, prompt, options);

  let minScore = 0;
  for (const v of tokenScores.values()) {
    if (v < minScore) minScore = v;
  }
  const missingLogit = minScore - 10;

  const logits = new Map();
  for (const { outcome } of dist) {
    logits.set(outcome, tokenScores.get(outcome) ?? missingLogit);
  }

  const probs = softmaxFromLogits(logits, { epsilon: EPS });

  const trueTop1 = dist.reduce((best, d) => (d.p > best.p ? d : best), dist[0]).outcome;
  const predictedTop1 = stableTopKFromMap(logits, 1)[0]?.token ?? null;
  const mostLikelyCorrect = predictedTop1 === trueTop1;

  const top5 = stableTopKFromMap(logits, 5).map((x) => x.token);
  let topKCoverage = 0;
  for (const { outcome, p } of dist) {
    if (top5.includes(outcome)) topKCoverage += p;
  }

  let kl = 0;
  for (const { outcome, p } of dist) {
    const q = probs.get(outcome) ?? EPS;
    kl += p * Math.log(p / Math.max(EPS, q));
  }

  return {
    count: true,
    correct: mostLikelyCorrect,
    metrics: {
      mostLikelyAccuracy: mostLikelyCorrect ? 1 : 0,
      topKCoverage,
      klDivergence: kl,
    },
    group: {
      difficulty: meta?.difficulty,
      branches: meta?.branches,
    },
  };
}

