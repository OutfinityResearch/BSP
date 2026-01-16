import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Noise robustness expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  const noise = Number(meta?.noise);
  const isClean = Number.isFinite(noise) && noise === 0;
  const isNoisy = Number.isFinite(noise) && noise >= 0.3;

  const metrics = {
    degradationCurve: correct ? 1 : 0,
  };
  if (isClean) metrics.cleanAccuracy = correct ? 1 : 0;
  if (isNoisy) metrics.noisyAccuracy = correct ? 1 : 0;

  return {
    count: true,
    correct,
    metrics,
    group: {
      difficulty: meta?.difficulty,
      noise: meta?.noise,
    },
  };
}
