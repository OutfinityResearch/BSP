/**
 * Unified Evaluator for Abstract Primitives Benchmarks
 * 
 * Runs BSP engine against all systems and produces an Abstract Primitives Profile.
 * Usage:
 *   node evaluate.mjs --self-check
 *   node evaluate.mjs --all
 *   node evaluate.mjs --system=01 --seed=123
 */

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

import { createRng, deriveSeed, normalizeSeed } from './rng.mjs';

const SYSTEMS = [
  '01_convergence',
  '02_divergence',
  '03_cycles',
  '04_hierarchy',
  '05_composition',
  '06_negation',
  '07_conditional_gates',
  '08_analogy',
  '09_context_switching',
  '10_chunking',
  '11_reversibility',
  '12_temporal_order',
  '13_exceptions',
  '14_interpolation',
  '15_counting',
  '16_recursion',
  '17_inhibition',
  '18_noise_robustness',
  '19_memory_decay',
  '20_transfer'
];

const TIERS = {
  1: ['01_convergence', '02_divergence', '03_cycles', '04_hierarchy', '05_composition'],
  2: ['06_negation', '07_conditional_gates', '08_analogy', '09_context_switching', '10_chunking',
      '11_reversibility', '12_temporal_order', '13_exceptions', '14_interpolation', '15_counting'],
  3: ['16_recursion', '17_inhibition', '18_noise_robustness', '19_memory_decay', '20_transfer']
};

// Resolve paths relative to this script's location
const __dirname = new URL('.', import.meta.url).pathname;

async function loadBSPEngine() {
  try {
    const mod = await import('../../src/core/index.mjs');
    if (!mod?.BSPEngine) {
      throw new Error('Missing export: BSPEngine');
    }
    return mod.BSPEngine;
  } catch (error) {
    const resolved = new URL('../../src/core/index.mjs', import.meta.url).pathname;
    const message = error && error.message ? error.message : String(error);
    throw new Error(
      `Failed to import BSPEngine from ${resolved}. ` +
      `Run this command from the repo root and ensure the engine builds. ` +
      `Original error: ${message}`
    );
  }
}

async function loadScorer(systemId) {
  try {
    const mod = await import(`./${systemId}/scorer.mjs`);
    if (typeof mod.parseTestLine !== 'function') {
      throw new Error('Missing export: parseTestLine(line)');
    }
    if (typeof mod.score !== 'function') {
      throw new Error('Missing export: score({engine,prompt,expected,meta,options})');
    }
    return mod;
  } catch (error) {
    const resolved = new URL(`./${systemId}/scorer.mjs`, import.meta.url).pathname;
    const message = error && error.message ? error.message : String(error);
    throw new Error(`Failed to import scorer for ${systemId} from ${resolved}. ${message}`);
  }
}

function accumulateMetric(metricSums, metricCounts, key, value) {
  if (!Number.isFinite(value)) return;
  metricSums.set(key, (metricSums.get(key) || 0) + value);
  metricCounts.set(key, (metricCounts.get(key) || 0) + 1);
}

function addBreakdown(breakdowns, group, correct) {
  if (!group || typeof group !== 'object') return;
  for (const [key, value] of Object.entries(group)) {
    if (value === undefined || value === null) continue;
    const val = String(value);
    if (!breakdowns[key]) breakdowns[key] = {};
    if (!breakdowns[key][val]) breakdowns[key][val] = { correct: 0, total: 0 };
    breakdowns[key][val].total++;
    if (correct) breakdowns[key][val].correct++;
  }
}

async function loadTestCases(testPath, scorer) {
  const cases = [];
  const stream = fs.createReadStream(testPath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    cases.push(scorer.parseTestLine(line));
  }

  return cases;
}

function evaluateTestCases(engine, scorer, testCases, scoringOptions) {
  let correct = 0;
  let total = 0;
  let support = 0;
  const metricSums = new Map();
  const metricCounts = new Map();
  const breakdowns = {};

  for (const tc of testCases) {
    const scored = scorer.score({
      engine,
      prompt: tc.prompt,
      expected: tc.expected,
      meta: tc.meta,
      options: scoringOptions,
    });

    if (!scored || typeof scored !== 'object') {
      throw new Error('Invalid scorer output');
    }

    if (scored.count === false) {
      support++;
      continue;
    }

    const isCorrect = Boolean(scored.correct);
    total++;
    if (isCorrect) correct++;

    if (scored.metrics && typeof scored.metrics === 'object') {
      for (const [key, value] of Object.entries(scored.metrics)) {
        accumulateMetric(metricSums, metricCounts, key, value);
      }
    }

    addBreakdown(breakdowns, scored.group, isCorrect);
  }

  const score = total > 0 ? (correct / total) * 100 : 0;

  const metrics = {};
  for (const [key, sum] of metricSums.entries()) {
    const count = metricCounts.get(key) || 0;
    if (count > 0) metrics[key] = sum / count;
  }

  return { correct, total, support, score, metrics, breakdowns };
}

function computeStepsToThreshold(curve, thresholdPercent) {
  for (const point of curve) {
    if (point.score >= thresholdPercent) return point.step;
  }
  return null;
}

function computeAULC(curve, maxSteps) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  const points = [...curve].sort((a, b) => a.step - b.step);
  const M = Math.max(1, Number(maxSteps) || 1);

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[i + 1] || null;

    const s0 = a.step;
    const v0 = Math.max(0, Math.min(100, Number(a.score) || 0)) / 100;
    const s1 = b ? b.step : M;
    const v1 = b ? (Math.max(0, Math.min(100, Number(b.score) || 0)) / 100) : v0;

    if (s0 >= M) break;
    const end = Math.min(s1, M);
    const span = Math.max(0, end - s0);
    if (span === 0) continue;

    const vEnd = b && s1 !== s0 ? (v0 + (v1 - v0) * ((end - s0) / (s1 - s0))) : v0;
    area += span * (v0 + vEnd) / 2;
  }

  return area / M;
}

function snapshotEngineStats(engine) {
  const stats = engine.getStats();
  return {
    step: stats.step,
    groupCount: stats.groupCount,
    edgeCount: stats.edgeCount,
    bufferSize: stats.bufferSize,
    rlPressure: stats.rlPressure,
    contextSize: stats.contextSize,
    metrics: { ...(stats.metrics || {}) },
    storeStats: { ...(stats.storeStats || {}) },
    graphStats: { ...(stats.graphStats || {}) },
    bufferStats: { ...(stats.bufferStats || {}) },
  };
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += Number(v) || 0;
  return sum / values.length;
}

function quantile(sortedValues, q) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  const qq = Math.max(0, Math.min(1, Number(q) || 0));
  const pos = (sortedValues.length - 1) * qq;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = Number(sortedValues[base]) || 0;
  const upper = Number(sortedValues[Math.min(sortedValues.length - 1, base + 1)]) || 0;
  return lower + rest * (upper - lower);
}

function summarizeDistribution(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].map(v => Number(v) || 0).sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: mean(sorted),
    min: sorted[0],
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1],
  };
}

function diffNumber(prev, next) {
  return (Number(next) || 0) - (Number(prev) || 0);
}

function computeStatsDelta(prevStats, nextStats, windowSteps) {
  const steps = Math.max(0, Number(windowSteps) || 0);
  const denom = Math.max(1, steps);

  const created = diffNumber(prevStats?.storeStats?.totalCreations, nextStats?.storeStats?.totalCreations);
  const merged = diffNumber(prevStats?.storeStats?.totalMerges, nextStats?.storeStats?.totalMerges);
  const pruned = diffNumber(prevStats?.storeStats?.totalPrunes, nextStats?.storeStats?.totalPrunes);
  const activates = diffNumber(prevStats?.storeStats?.totalActivations, nextStats?.storeStats?.totalActivations);

  const strengthenOps = diffNumber(prevStats?.graphStats?.strengthenOps, nextStats?.graphStats?.strengthenOps);
  const weakenOps = diffNumber(prevStats?.graphStats?.weakenOps, nextStats?.graphStats?.weakenOps);

  const groupCountDelta = diffNumber(prevStats?.groupCount, nextStats?.groupCount);
  const edgeCountDelta = diffNumber(prevStats?.edgeCount, nextStats?.edgeCount);
  const bufferSizeDelta = diffNumber(prevStats?.bufferSize, nextStats?.bufferSize);

  return {
    steps,
    counts: {
      groupsCreated: created,
      groupsMerged: merged,
      groupsPruned: pruned,
      activations: activates,
      strengthenOps,
      weakenOps,
      groupCountDelta,
      edgeCountDelta,
      bufferSizeDelta,
    },
    perStep: {
      groupsCreated: created / denom,
      groupsMerged: merged / denom,
      groupsPruned: pruned / denom,
      activations: activates / denom,
      strengthenOps: strengthenOps / denom,
      weakenOps: weakenOps / denom,
      groupCountDelta: groupCountDelta / denom,
      edgeCountDelta: edgeCountDelta / denom,
      bufferSizeDelta: bufferSizeDelta / denom,
    },
  };
}

async function evaluateSystem(systemId, BSPEngine, config) {
  console.log(`\n=== Evaluating: ${systemId} ===`);

  const baseSeed = normalizeSeed(config.seed ?? 1);
  const systemSeed = deriveSeed(baseSeed, systemId);
  const rng = createRng(systemSeed);
  
  const systemDir = path.join(__dirname, systemId);
  const trainPath = path.join(systemDir, 'train.txt');
  const testPath = path.join(systemDir, 'test.txt');
  const metaPath = path.join(systemDir, 'metadata.json');
  
  // Check if data exists
  if (!fs.existsSync(trainPath)) {
    console.error(`  Training data not found: ${trainPath}`);
    console.log('  Run: node generate.mjs --all');
    return { systemId, status: 'no_data', score: 0, baseSeed, systemSeed };
  }
  
  // Load metadata
  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch (e) {
    // No metadata, continue anyway
  }
  
  // Real evaluation with BSPEngine
  let engine = new BSPEngine({
    universeSize: 10000,
    maxGroups: 5000,
    useVocab: true,
    useCompressionMachine: false,
    tokenizerConfig: {
      ngramSizes: [1]
    }
  });

  const scorer = await loadScorer(systemId);
  const testCases = await loadTestCases(testPath, scorer);
  
  // Training phase
  console.log('  Training...');
  const trainStream = fs.createReadStream(trainPath);
  const trainRl = readline.createInterface({ input: trainStream, crlfDelay: Infinity });
  
  let trainCount = 0;
  const curve = [];
  const scoringOptions = {
    topKGroups: config.topKGroups ?? 20,
    topKTokens: config.topKTokens ?? 10,
  };

  const checkpointEvery = Math.max(1, Number(config.checkpointEvery) || 500);
  const thresholds = [50, 80];
  const aulcSteps = Math.max(1, Number(config.aulcSteps) || 5000);

  const snapshotAndEval = () => {
    const snap = engine.toJSON();
    const res = evaluateTestCases(engine, scorer, testCases, scoringOptions);
    engine = BSPEngine.fromJSON(snap);
    return res;
  };

  const diagnosticWindows = {
    candidateFanout: [],
    activeGroups: [],
    inputSize: [],
    surprise: [],
    hallucination: [],
    surpriseRatio: [],
    hallucinationRatio: [],
  };

  const diagnostics = [];
  let prevStats = snapshotEngineStats(engine);

  // Baseline checkpoint at step 0
  {
    const evalRes = snapshotAndEval();
    curve.push({ step: 0, score: evalRes.score });
    diagnostics.push({
      step: 0,
      stats: prevStats,
      delta: null,
      window: null,
    });
  }

  for await (const line of trainRl) {
    if (!line.trim()) continue;
    const tokens = engine.tokenizer.tokenizeWords(line);
    const inputBits = engine.encodeFromTokens(tokens, { allowVocabGrowth: false });
    diagnosticWindows.candidateFanout.push(engine.store.getCandidates(inputBits).size);

    const out = engine.process(line, { learn: true });
    diagnosticWindows.activeGroups.push(out.activeGroupIds?.length || 0);
    diagnosticWindows.inputSize.push(out.inputSize || 0);
    diagnosticWindows.surprise.push(out.surprise || 0);
    diagnosticWindows.hallucination.push(out.hallucination || 0);

    const denom = Math.max(1, Number(out.inputSize) || 0);
    diagnosticWindows.surpriseRatio.push((Number(out.surprise) || 0) / denom);
    diagnosticWindows.hallucinationRatio.push((Number(out.hallucination) || 0) / denom);

    trainCount++;
    if (trainCount % 2000 === 0) {
      process.stdout.write(`\r  Trained ${trainCount} samples...`);
    }

    if (trainCount % checkpointEvery === 0) {
      const evalRes = snapshotAndEval();
      curve.push({ step: trainCount, score: evalRes.score });

      const nextStats = snapshotEngineStats(engine);
      diagnostics.push({
        step: trainCount,
        stats: nextStats,
        delta: computeStatsDelta(prevStats, nextStats, diagnosticWindows.candidateFanout.length),
        window: {
          candidateFanout: summarizeDistribution(diagnosticWindows.candidateFanout),
          activeGroups: summarizeDistribution(diagnosticWindows.activeGroups),
          inputSize: summarizeDistribution(diagnosticWindows.inputSize),
          surprise: summarizeDistribution(diagnosticWindows.surprise),
          hallucination: summarizeDistribution(diagnosticWindows.hallucination),
          surpriseRatio: summarizeDistribution(diagnosticWindows.surpriseRatio),
          hallucinationRatio: summarizeDistribution(diagnosticWindows.hallucinationRatio),
        },
      });

      prevStats = nextStats;
      for (const key of Object.keys(diagnosticWindows)) diagnosticWindows[key].length = 0;
    }
  }
  console.log(`\r  Trained ${trainCount} samples.`);
  
  // Testing phase
  console.log('  Testing...');
  const finalEval = snapshotAndEval();
  const score = finalEval.score;

  if (diagnosticWindows.candidateFanout.length > 0 || diagnostics.length === 0) {
    const nextStats = snapshotEngineStats(engine);
    diagnostics.push({
      step: trainCount,
      stats: nextStats,
      delta: computeStatsDelta(prevStats, nextStats, diagnosticWindows.candidateFanout.length),
      window: diagnosticWindows.candidateFanout.length === 0 ? null : {
        candidateFanout: summarizeDistribution(diagnosticWindows.candidateFanout),
        activeGroups: summarizeDistribution(diagnosticWindows.activeGroups),
        inputSize: summarizeDistribution(diagnosticWindows.inputSize),
        surprise: summarizeDistribution(diagnosticWindows.surprise),
        hallucination: summarizeDistribution(diagnosticWindows.hallucination),
        surpriseRatio: summarizeDistribution(diagnosticWindows.surpriseRatio),
        hallucinationRatio: summarizeDistribution(diagnosticWindows.hallucinationRatio),
      },
    });
    prevStats = nextStats;
    for (const key of Object.keys(diagnosticWindows)) diagnosticWindows[key].length = 0;
  }

  // Ensure final checkpoint is present
  const last = curve.length > 0 ? curve[curve.length - 1] : null;
  if (!last || last.step !== trainCount) {
    curve.push({ step: trainCount, score });
  }

  const stepsTo = {
    steps_to_50: computeStepsToThreshold(curve, thresholds[0]),
    steps_to_80: computeStepsToThreshold(curve, thresholds[1]),
  };

  const aulc = computeAULC(curve, aulcSteps);
  
  console.log(`  Score: ${score.toFixed(1)}% (${finalEval.correct}/${finalEval.total})`);
  console.log(
    `  TTC@50%: ${stepsTo.steps_to_50 === null ? 'not_reached' : stepsTo.steps_to_50} steps; ` +
    `TTC@80%: ${stepsTo.steps_to_80 === null ? 'not_reached' : stepsTo.steps_to_80} steps; ` +
    `AULC@${aulcSteps}: ${Number.isFinite(aulc) ? aulc.toFixed(4) : 'null'}`
  );
  
  return {
    systemId,
    systemName: metadata.systemName || systemId,
    status: 'evaluated',
    baseSeed,
    systemSeed,
    score,
    correct: finalEval.correct,
    total: finalEval.total,
    support: finalEval.support,
    metrics: finalEval.metrics,
    breakdowns: finalEval.breakdowns,
    curve,
    stepsTo,
    aulc,
    checkpointEvery,
    aulcSteps,
    diagnostics,
    _rng: typeof rng === 'function' ? 'derived' : 'none'
  };
}

function renderBar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function printCognitiveProfile(results) {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              BSP ABSTRACT PRIMITIVES PROFILE                   ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  
  // Tier 1
  console.log('║ TIER 1: CORE PRIMITIVES                                        ║');
  for (const systemId of TIERS[1]) {
    const result = results.find(r => r.systemId === systemId);
    if (result) {
      const name = result.systemName.padEnd(20);
      const score = result.score.toFixed(1).padStart(5);
      const bar = renderBar(result.score);
      console.log(`║   ${name} ${score}%  ${bar}   ║`);
    }
  }
  
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ TIER 2: EXTENDED PRIMITIVES                                    ║');
  for (const systemId of TIERS[2]) {
    const result = results.find(r => r.systemId === systemId);
    if (result) {
      const name = result.systemName.padEnd(20);
      const score = result.score.toFixed(1).padStart(5);
      const bar = renderBar(result.score);
      console.log(`║   ${name} ${score}%  ${bar}   ║`);
    }
  }
  
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ TIER 3: LEARNING & ROBUSTNESS                                  ║');
  for (const systemId of TIERS[3]) {
    const result = results.find(r => r.systemId === systemId);
    if (result) {
      const name = result.systemName.padEnd(20);
      const score = result.score.toFixed(1).padStart(5);
      const bar = renderBar(result.score);
      console.log(`║   ${name} ${score}%  ${bar}   ║`);
    }
  }
  
  // Summary
  const validResults = results.filter(r => r.score !== undefined);
  const avgScore = validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length;
  
  const sorted = [...validResults].sort((a, b) => b.score - a.score);
  const strengths = sorted.slice(0, 3).map(r => r.systemName).join(', ');
  const weaknesses = sorted.slice(-3).reverse().map(r => r.systemName).join(', ');
  
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║ OVERALL SCORE: ${avgScore.toFixed(1)}%`.padEnd(64) + '║');
  console.log(`║ STRENGTHS: ${strengths}`.padEnd(64) + '║');
  console.log(`║ WEAKNESSES: ${weaknesses}`.padEnd(64) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

function getResultsDir(config) {
  const baseSeed = normalizeSeed(config.seed ?? 1);
  return path.join(__dirname, 'results', `seed_${baseSeed}`);
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function formatSummary(config, results) {
  const baseSeed = normalizeSeed(config.seed ?? 1);
  const lines = [];
  lines.push(`BSP Abstract Primitives Results`);
  lines.push(`seed=${baseSeed}`);
  lines.push(`checkpointEvery=${Math.max(1, Number(config.checkpointEvery) || 500)}`);
  lines.push(`aulcSteps=${Math.max(1, Number(config.aulcSteps) || 5000)}`);
  lines.push('');

  for (const r of results) {
    if (!r || r.status !== 'evaluated') continue;
    const t50 = r.stepsTo?.steps_to_50 ?? null;
    const t80 = r.stepsTo?.steps_to_80 ?? null;
    const aulc = Number.isFinite(r.aulc) ? r.aulc.toFixed(4) : 'null';
    lines.push(
      `${r.systemId} ${r.systemName} ` +
      `score=${r.score.toFixed(1)} ` +
      `ttc50=${t50 === null ? 'null' : t50} ` +
      `ttc80=${t80 === null ? 'null' : t80} ` +
      `aulc=${aulc}`
    );
  }

  lines.push('');
  return lines.join('\n') + '\n';
}

function writeResultsFile(config, results) {
  const baseSeed = normalizeSeed(config.seed ?? 1);
  const resultsDir = getResultsDir(config);
  ensureDirSync(resultsDir);
  const resultsPath = path.join(resultsDir, 'results.json');
  const summaryPath = path.join(resultsDir, 'summary.txt');

  fs.writeFileSync(resultsPath, JSON.stringify({
    schema: 'bsp_abstract_primitives_evaluation',
    schemaVersion: 1,
    baseSeed,
    config: {
      topKGroups: config.topKGroups,
      topKTokens: config.topKTokens,
      checkpointEvery: config.checkpointEvery,
      aulcSteps: config.aulcSteps,
    },
    results
  }, null, 2));

  fs.writeFileSync(summaryPath, formatSummary(config, results));

  console.log(`\nResults saved to: ${resultsPath}`);
  console.log(`Summary saved to: ${summaryPath}`);
}

async function evaluateAll(config) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       ABSTRACT PRIMITIVES BENCHMARK EVALUATOR                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  const BSPEngine = await loadBSPEngine();
  const results = [];
  
  for (const systemId of SYSTEMS) {
    try {
      const result = await evaluateSystem(systemId, BSPEngine, config);
      results.push(result);
    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
      results.push({ systemId, status: 'error', score: 0, error: error.message });
    }
  }
  
  // Print profile
  printCognitiveProfile(results);
  
  writeResultsFile(config, results);
  
  return results;
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    systems: [],
    all: false,
    selfCheck: false,
    seed: 1,
    topKGroups: 20,
    topKTokens: 10,
    checkpointEvery: 500,
    aulcSteps: 5000,
  };
  
  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      config.all = true;
    } else if (arg === '--self-check') {
      config.selfCheck = true;
    } else if (arg.startsWith('--seed=')) {
      config.seed = normalizeSeed(arg.split('=')[1]);
    } else if (arg.startsWith('--topk-groups=')) {
      config.topKGroups = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--topk-tokens=')) {
      config.topKTokens = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--checkpoint-every=')) {
      config.checkpointEvery = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--aulc-steps=')) {
      config.aulcSteps = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--system=')) {
      config.systems.push(arg.split('=')[1]);
    }
  }
  
  return config;
}

async function runSelfCheck() {
  const resolved = new URL('../../src/core/index.mjs', import.meta.url).pathname;
  await loadBSPEngine();
  console.log(`BSPEngine import OK: ${resolved}`);
}

async function main() {
  const config = parseArgs();

  if (config.selfCheck) {
    await runSelfCheck();
    return;
  }
  
  if (config.all || config.systems.length === 0) {
    await evaluateAll(config);
  } else {
    const BSPEngine = await loadBSPEngine();
    const results = [];
    for (const systemId of config.systems) {
      const fullId = SYSTEMS.find(s => s.startsWith(systemId) || s === systemId);
      if (fullId) {
        const result = await evaluateSystem(fullId, BSPEngine, config);
        results.push(result);
      } else {
        console.error(`Unknown system: ${systemId}`);
      }
    }

    if (results.length > 0) {
      printCognitiveProfile(results);
      writeResultsFile(config, results);
    }
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
