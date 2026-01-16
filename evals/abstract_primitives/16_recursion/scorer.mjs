import {
  parseTestLine,
  rolloutTop1,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (!Array.isArray(expected) || expected.some((t) => typeof t !== 'string')) {
    throw new Error('Recursion expected_json must be a JSON array of strings');
  }

  const startTokens = prompt.trim().split(/\s+/).filter(Boolean);
  const predicted = rolloutTop1(engine, startTokens, expected.length, options);

  let correctCount = 0;
  for (let i = 0; i < expected.length; i++) {
    if (predicted[i] === expected[i]) correctCount++;
  }

  const perTokenAccuracy = expected.length > 0 ? correctCount / expected.length : 0;
  const fullCorrect = expected.length > 0 ? (correctCount === expected.length) : false;

  return {
    count: true,
    correct: fullCorrect,
    metrics: {
      nestingDepthAccuracy: fullCorrect ? 1 : 0,
      perTokenAccuracy,
    },
    group: {
      difficulty: meta?.difficulty,
      depth: meta?.depth,
    },
  };
}

