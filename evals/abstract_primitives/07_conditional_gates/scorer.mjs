import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Conditional gates expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  const gate = String(meta?.gate ?? 'unknown');
  const gateAccuracyKey = `${gate}Accuracy`;

  return {
    count: true,
    correct,
    metrics: {
      logicGateAccuracy: correct ? 1 : 0,
      [gateAccuracyKey]: correct ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
      gate,
    },
  };
}

