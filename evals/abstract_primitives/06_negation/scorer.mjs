import {
  parseTestLine,
  predictTopTokens,
  containsToken,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Negation expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { topTokens } = predictTopTokens(engine, prompt, options);
  const top5 = topTokens.slice(0, 5);

  const contradiction = containsToken(top5, expected);
  const exclusionCorrect = !contradiction;

  return {
    count: true,
    correct: exclusionCorrect,
    metrics: {
      exclusionAccuracy: exclusionCorrect ? 1 : 0,
      falsePositiveRate: contradiction ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
    },
  };
}
