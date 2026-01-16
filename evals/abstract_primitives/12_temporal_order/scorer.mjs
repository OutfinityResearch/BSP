import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Temporal order expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  const reversedResult = typeof meta?.reversedResult === 'string' ? meta.reversedResult : null;
  const reversedConfusion = reversedResult && reversedResult !== 'none' ? (top1 === reversedResult) : false;

  return {
    count: true,
    correct,
    metrics: {
      correctOrderAccuracy: correct ? 1 : 0,
      reversedOrderDifferentiation: reversedConfusion ? 0 : 1,
      orderSensitivityScore: correct && !reversedConfusion ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
    },
  };
}

