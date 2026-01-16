import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Exceptions expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  const kind = String(meta?.kind ?? 'unknown'); // default | exception
  const metrics = {
    exceptionHandlingAccuracy: correct ? 1 : 0,
  };

  if (kind === 'default') {
    metrics.defaultRuleAccuracy = correct ? 1 : 0;
  } else if (kind === 'exception') {
    metrics.exceptionRecognition = correct ? 1 : 0;
  }

  return {
    count: true,
    correct,
    metrics,
    group: {
      difficulty: meta?.difficulty,
      kind,
    },
  };
}
