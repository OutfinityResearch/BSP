import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

function regionFor(count, threshold) {
  if (!Number.isFinite(count) || !Number.isFinite(threshold)) return 'unknown';
  if (count < threshold) return 'below';
  if (count > threshold) return 'above';
  return 'boundary';
}

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Counting expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const correct = top1 === expected;

  const count = Number(meta?.count);
  const threshold = Number(meta?.threshold);
  const region = regionFor(count, threshold);

  const perRegionKey = region === 'boundary' ? 'boundaryAccuracy' : `${region}ThresholdAccuracy`;

  return {
    count: true,
    correct,
    metrics: {
      thresholdDetectionAccuracy: correct ? 1 : 0,
      [perRegionKey]: correct ? 1 : 0,
    },
    group: {
      difficulty: meta?.difficulty,
      region,
    },
  };
}
