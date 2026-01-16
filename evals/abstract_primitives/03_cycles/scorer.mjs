import {
  parseTestLine,
  predictTopTokens,
  rolloutTop1,
} from '../scoring_utils.mjs';

export { parseTestLine };

const TOKEN_RE = /^c(\d{2})x(\d{2})$/;
const HORIZON = 10;

function parseCycleToken(token) {
  const match = TOKEN_RE.exec(token);
  if (!match) return null;
  return { cycle: match[1], pos: Number(match[2]) };
}

function formatCycleToken(cycle, pos) {
  return `c${cycle}x${String(pos).padStart(2, '0')}`;
}

export function score({ engine, prompt, expected, meta, options }) {
  if (typeof expected !== 'string') {
    throw new Error(`Cycles expected_json must be a JSON string; got ${typeof expected}`);
  }

  const { top1 } = predictTopTokens(engine, prompt, options);
  const nextStepCorrect = top1 === expected;

  const contextTokens = prompt.trim().split(/\s+/).filter(Boolean);
  const last = contextTokens.length > 0 ? contextTokens[contextTokens.length - 1] : null;
  const parsed = last ? parseCycleToken(last) : null;
  const period = Number(meta?.period);

  let periodicityRetention = 0;
  if (parsed && Number.isFinite(period) && period > 0) {
    const expectedTokens = [];
    for (let i = 1; i <= HORIZON; i++) {
      expectedTokens.push(formatCycleToken(parsed.cycle, (parsed.pos + i) % period));
    }

    const predicted = rolloutTop1(engine, contextTokens, HORIZON, options);
    let correctCount = 0;
    for (let i = 0; i < Math.min(HORIZON, predicted.length); i++) {
      if (predicted[i] === expectedTokens[i]) correctCount++;
    }
    periodicityRetention = correctCount / HORIZON;
  }

  return {
    count: true,
    correct: nextStepCorrect,
    metrics: {
      nextStepAccuracy: nextStepCorrect ? 1 : 0,
      periodicityRetention,
    },
    group: {
      difficulty: meta?.difficulty,
      period: meta?.period,
    },
  };
}

