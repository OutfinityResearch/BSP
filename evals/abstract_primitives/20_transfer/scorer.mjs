import {
  parseTestLine,
  processPrompt,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  const kind = String(meta?.kind ?? 'query');

  if (kind !== 'query') {
    processPrompt(engine, prompt, { learn: true });
    return {
      count: false,
      correct: false,
      metrics: { support: 1 },
      group: { kind },
    };
  }

  if (typeof expected !== 'string') {
    throw new Error(`Transfer expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  return {
    count: true,
    correct,
    metrics: {
      domain2Accuracy: correct ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
      kind,
    },
  };
}

