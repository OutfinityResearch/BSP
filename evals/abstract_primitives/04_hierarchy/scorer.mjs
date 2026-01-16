import {
  parseTestLine,
  containsToken,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Hierarchy expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { topTokens, top1 } = predictTopTokens(engine, prompt, options);
  const top5 = topTokens.slice(0, 5).map((t) => t.token);

  const correct = top1 === expected;
  const ancestors = Array.isArray(meta?.ancestors) ? meta.ancestors.map(String) : [];
  const ancestryRecall = ancestors.some((a) => top5.includes(a));

  return {
    count: true,
    correct,
    metrics: {
      immediateParentAccuracy: correct ? 1 : 0,
      ancestryRecall: ancestryRecall ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
    },
  };
}

