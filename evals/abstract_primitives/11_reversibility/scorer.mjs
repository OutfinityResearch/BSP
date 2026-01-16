import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Reversibility expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  return {
    count: true,
    correct,
    metrics: {
      inverseRecall: correct ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
      direction: meta?.direction,
    },
  };
}

