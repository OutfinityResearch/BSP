import {
  parseTestLine,
  containsToken,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

function bucketizePathLength(pathLength) {
  if (!Number.isFinite(pathLength)) return 'unknown';
  if (pathLength <= 3) return 'short';
  if (pathLength <= 6) return 'medium';
  return 'long';
}

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Convergence expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { topTokens, top1 } = predictTopTokens(engine, prompt, options);
  const top5 = topTokens.slice(0, 5);

  const correct = top1 === expected;
  const hitAt5 = containsToken(top5, expected);

  const pathLength = Number(meta?.pathLength);
  const bucket = bucketizePathLength(pathLength);

  return {
    count: true,
    correct,
    metrics: {
      transitiveClosureAccuracy: correct ? 1 : 0,
      hitAt5: hitAt5 ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
      bucket,
    },
  };
}

