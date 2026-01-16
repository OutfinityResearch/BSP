const TAB_FIELDS = 3;
const DEFAULT_TOP_K_GROUPS = 20;
const DEFAULT_TOP_K_TOKENS = 10;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_BEAM_WIDTH = 128;
const DEFAULT_DEPTH_DECAY = 0.7;

export function parseTestLine(line) {
  const parts = line.split('\t');
  if (parts.length !== TAB_FIELDS) {
    throw new Error(`Invalid test line format (expected ${TAB_FIELDS} tab fields): ${JSON.stringify(line)}`);
  }

  const prompt = parts[0];
  let expected;
  let meta;

  try {
    expected = JSON.parse(parts[1]);
  } catch (error) {
    throw new Error(`Invalid expected_json in test line: ${JSON.stringify(line)}`);
  }

  try {
    meta = JSON.parse(parts[2]);
  } catch (error) {
    throw new Error(`Invalid meta_json in test line: ${JSON.stringify(line)}`);
  }

  return { prompt, expected, meta };
}

export function normalizeTokenScoreOptions(options = {}) {
  return {
    topKGroups: Number.isFinite(options.topKGroups) ? options.topKGroups : DEFAULT_TOP_K_GROUPS,
    topKTokens: Number.isFinite(options.topKTokens) ? options.topKTokens : DEFAULT_TOP_K_TOKENS,
    maxDepth: Number.isFinite(options.maxDepth) ? options.maxDepth : DEFAULT_MAX_DEPTH,
    beamWidth: Number.isFinite(options.beamWidth) ? options.beamWidth : DEFAULT_BEAM_WIDTH,
    depthDecay: Number.isFinite(options.depthDecay) ? options.depthDecay : DEFAULT_DEPTH_DECAY,
  };
}

export function stableTopKFromMap(scoreMap, k) {
  const items = [...scoreMap.entries()].map(([token, score]) => ({ token, score }));
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  return items.slice(0, Math.max(0, k | 0));
}

export function processPrompt(engine, prompt, { learn }) {
  engine.resetContext();
  return engine.process(prompt, { learn: Boolean(learn) });
}

export function getTokenScores(engine, activeGroupIds, options = {}) {
  const { topKGroups, maxDepth, beamWidth, depthDecay } = normalizeTokenScoreOptions(options);
  const scores = engine.graph.predictMultiHop(activeGroupIds, { maxDepth, beamWidth, depthDecay });
  const groupPredictions = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topKGroups)
    .map(([groupId, score]) => ({ groupId, score }));
  const tokenScores = new Map();

  for (const { groupId, score } of groupPredictions) {
    const group = engine.store.get(groupId);
    if (!group) continue;

    const memberIds = group.members.toArray();
    if (memberIds.length === 0) continue;

    const tokens = engine.tokenizer.decode(memberIds);
    const expanded = new Set();
    for (const token of tokens) {
      if (!token) continue;
      if (token.includes('_')) {
        for (const part of token.split('_')) {
          if (part) expanded.add(part);
        }
      } else {
        expanded.add(token);
      }
    }
    for (const token of expanded) {
      tokenScores.set(token, (tokenScores.get(token) || 0) + score);
    }
  }

  return { tokenScores, groupPredictions };
}

export function predictTopTokens(engine, prompt, options = {}) {
  const result = processPrompt(engine, prompt, { learn: false });
  const { tokenScores } = getTokenScores(engine, result.activeGroupIds, options);
  const { topKTokens } = normalizeTokenScoreOptions(options);
  const topTokens = stableTopKFromMap(tokenScores, topKTokens);
  return {
    result,
    tokenScores,
    topTokens,
    top1: topTokens.length > 0 ? topTokens[0].token : null,
    top1Score: topTokens.length > 0 ? topTokens[0].score : null,
  };
}

export function containsToken(topTokens, token) {
  if (token == null) return false;
  return topTokens.some((t) => t.token === token);
}

export function softmaxFromLogits(logitsByKey, { temperature = 1, epsilon = 1e-12 } = {}) {
  const keys = [...logitsByKey.keys()];
  if (keys.length === 0) return new Map();

  const invT = 1 / Math.max(epsilon, Number(temperature) || 1);
  let max = -Infinity;
  for (const key of keys) {
    const v = logitsByKey.get(key);
    if (v > max) max = v;
  }

  let sum = 0;
  const exps = new Map();
  for (const key of keys) {
    const v = logitsByKey.get(key);
    const e = Math.exp((v - max) * invT);
    exps.set(key, e);
    sum += e;
  }

  const probs = new Map();
  for (const key of keys) {
    probs.set(key, exps.get(key) / Math.max(epsilon, sum));
  }
  return probs;
}

export function rolloutTop1(engine, startTokens, steps, options = {}) {
  const tokens = [...startTokens];
  const predicted = [];
  for (let i = 0; i < steps; i++) {
    const prompt = tokens.join(' ');
    const { top1 } = predictTopTokens(engine, prompt, options);
    predicted.push(top1);
    if (top1) {
      tokens.push(top1);
    } else {
      break;
    }
  }
  return predicted;
}
