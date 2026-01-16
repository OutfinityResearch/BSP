import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Memory decay expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  const recency = Number(meta?.recency);
  const metrics = {
    recencySensitivityCurve: correct ? 1 : 0,
  };
  if (Number.isFinite(recency) && recency <= 2) {
    metrics.recentAccuracy = correct ? 1 : 0;
  }
  if (Number.isFinite(recency) && recency >= 6) {
    metrics.distantAccuracy = correct ? 1 : 0;
  }

  return {
    count: true,
    correct,
    metrics,
    group: {
      difficulty: meta?.difficulty,
      recency: meta?.recency,
    },
  };
}
