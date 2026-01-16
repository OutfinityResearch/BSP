import {
  parseTestLine,
  predictTopTokens,
} from '../scoring_utils.mjs';

export { parseTestLine };

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Inhibition expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { topTokens, top1 } = predictTopTokens(engine, prompt, options);
  const top5 = topTokens.slice(0, 5).map((t) => t.token);

  const winnerCorrect = top1 === expected;
  const losers = Array.isArray(meta?.losers) ? meta.losers.map(String) : [];

  let losersInTop5 = 0;
  for (const loser of losers) {
    if (top5.includes(loser)) losersInTop5++;
  }

  const suppressionRate = losers.length > 0 ? (1 - losersInTop5 / losers.length) : 1;

  return {
    count: true,
    correct: winnerCorrect,
    metrics: {
      winnerSelectionAccuracy: winnerCorrect ? 1 : 0,
      suppressionRate,
    },
    group: {
      difficulty: meta?.difficulty,
    },
  };
}

