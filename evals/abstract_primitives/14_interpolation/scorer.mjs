import {
  parseTestLine,
  containsToken,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Interpolation expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { topTokens, top1 } = predictTopTokens(engine, prompt, options);
  const top5 = topTokens.slice(0, 5);

  const correct = top1 === expected;
  const hitAt5 = containsToken(top5, expected);

  return {
    count: true,
    correct,
    metrics: {
      gapFillAccuracy: correct ? 1 : 0,
      hitAt5: hitAt5 ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
      gapIndex: meta?.gapIndex,
    },
  };
}

