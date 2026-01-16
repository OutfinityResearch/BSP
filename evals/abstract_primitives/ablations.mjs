/**
 * Ablation sweep runner for Abstract Primitives (Discovery-only).
 *
 * Runs one-dimensional sweeps around a base config and records:
 * - average score across selected systems
 * - per-system score
 * - basic footprint counters (groups, edges, vocab)
 *
 * Usage:
 *   node ablations.mjs --tier=1 --seed=1
 *   node ablations.mjs --systems=01_convergence,05_composition --seed=1 --train-limit=2000 --test-limit=200
 */

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

import { normalizeSeed } from './rng.mjs';

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

const __dirname = new URL('.', import.meta.url).pathname;

async function loadBSPEngine() {
  const mod = await import('../../src/core/index.mjs');
  if (!mod?.BSPEngine) throw new Error('Missing export: BSPEngine');
  return mod.BSPEngine;
}

async function loadScorer(systemId) {
  const mod = await import(`./${systemId}/scorer.mjs`);
  if (typeof mod.parseTestLine !== 'function') throw new Error(`Missing parseTestLine in ${systemId}/scorer.mjs`);
  if (typeof mod.score !== 'function') throw new Error(`Missing score in ${systemId}/scorer.mjs`);
  return mod;
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getResultsDir(config) {
  const baseSeed = normalizeSeed(config.seed ?? 1);
  return path.join(__dirname, 'results', `seed_${baseSeed}`);
}

function average(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function loadTrainLines(trainPath, limit) {
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(trainPath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

async function loadTestCases(testPath, scorer, limit) {
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(testPath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    out.push(scorer.parseTestLine(t));
    if (out.length >= limit) break;
  }
  return out;
}

function evaluateTestCases(engine, scorer, testCases, scoringOptions) {
  let correct = 0;
  let total = 0;
  let support = 0;

  for (const tc of testCases) {
    const scored = scorer.score({
      engine,
      prompt: tc.prompt,
      expected: tc.expected,
      meta: tc.meta,
      options: scoringOptions,
    });

    if (scored.count === false) {
      support++;
      continue;
    }

    total++;
    if (scored.correct) correct++;
  }

  const score = total > 0 ? (correct / total) * 100 : 0;
  return { correct, total, support, score };
}

function snapshotAndEval(engine, BSPEngine, fn) {
  const snap = engine.toJSON();
  const res = fn();
  const restored = BSPEngine.fromJSON(snap);
  return { res, restored };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    seed: 1,
    tier: '1',
    systems: [],
    trainLimit: 5000,
    testLimit: 500,
    sweep: 'all',
  };

  for (const arg of args) {
    if (arg.startsWith('--seed=')) config.seed = normalizeSeed(arg.split('=')[1]);
    else if (arg.startsWith('--tier=')) config.tier = arg.split('=')[1];
    else if (arg.startsWith('--systems=')) {
      config.systems.push(...arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--system=')) {
      config.systems.push(arg.split('=')[1]);
    } else if (arg.startsWith('--train-limit=')) {
      config.trainLimit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--test-limit=')) {
      config.testLimit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--sweep=')) {
      config.sweep = arg.split('=')[1];
    }
  }

  return config;
}

function resolveSystems(config) {
  if (config.systems.length > 0) {
    return config.systems.map((s) => {
      const full = SYSTEMS.find((id) => id === s || id.startsWith(s));
      if (!full) throw new Error(`Unknown system=${s}`);
      return full;
    });
  }

  const tier = Number(config.tier);
  if (!TIERS[tier]) throw new Error(`Unknown tier=${config.tier}`);
  return [...TIERS[tier]];
}

function buildDefaultSweeps() {
  return [
    {
      id: 'learner.topK',
      values: [4, 8, 16, 32, 64],
      apply: (base, v) => ({ ...base, learnerTopK: v }),
    },
    {
      id: 'predictMultiHop.maxDepth',
      values: [1, 2, 3, 4, 5],
      apply: (base, v) => ({ ...base, maxDepth: v }),
    },
    {
      id: 'rlPressure',
      values: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0],
      apply: (base, v) => ({ ...base, rlPressure: v }),
    },
    {
      id: 'tokenizer.ngrams',
      values: [[1], [1, 2], [1, 2, 3]],
      apply: (base, v) => ({ ...base, ngramSizes: v }),
    },
    {
      id: 'index.maxGroupsPerIdentity',
      values: [64, 128, 256, 512],
      apply: (base, v) => ({ ...base, maxGroupsPerIdentity: v }),
    },
  ];
}

function configLabel(variant) {
  const parts = [];
  parts.push(`topK=${variant.learnerTopK}`);
  parts.push(`maxDepth=${variant.maxDepth}`);
  parts.push(`rho=${variant.rlPressure}`);
  parts.push(`ngrams=${variant.ngramSizes.join(',')}`);
  parts.push(`maxGroupsPerIdentity=${variant.maxGroupsPerIdentity}`);
  return parts.join(' ');
}

function formatSummary(out) {
  const lines = [];
  lines.push('BSP Abstract Primitives Ablations');
  lines.push(`seed=${out.baseSeed}`);
  lines.push(`systems=${out.config.systems.join(',')}`);
  lines.push(`trainLimit=${out.config.trainLimit}`);
  lines.push(`testLimit=${out.config.testLimit}`);
  lines.push('');

  for (const sweep of out.sweeps) {
    lines.push(`SWEEP ${sweep.id}`);
    for (const v of sweep.variants.slice(0, 10)) {
      lines.push(`${v.averageScore.toFixed(3)}\t${v.label}`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

async function runVariant(BSPEngine, suite, variant, config) {
  const scoringOptions = {
    topKGroups: 20,
    topKTokens: 10,
    maxDepth: variant.maxDepth,
  };

  const perSystem = {};
  const scores = [];

  for (const s of suite) {
    const engine = new BSPEngine({
      universeSize: 10000,
      maxGroups: 5000,
      useVocab: true,
      useCompressionMachine: false,
      rlPressure: variant.rlPressure,
      tokenizerConfig: { ngramSizes: variant.ngramSizes },
      learnerConfig: { topK: variant.learnerTopK },
      indexConfig: { maxGroupsPerIdentity: variant.maxGroupsPerIdentity },
    });

    for (const line of s.trainLines) {
      engine.process(line, { learn: true });
    }

    const { res, restored } = snapshotAndEval(engine, BSPEngine, () => {
      return evaluateTestCases(engine, s.scorer, s.testCases, scoringOptions);
    });

    perSystem[s.systemId] = {
      score: res.score,
      correct: res.correct,
      total: res.total,
      support: res.support,
      footprint: {
        groups: restored.store.size,
        edges: restored.graph.edgeCount,
        vocab: restored.vocabTracker.size,
        buffer: restored.buffer.size,
      },
    };
    scores.push(res.score);
  }

  return {
    label: configLabel(variant),
    variant,
    averageScore: average(scores),
    perSystem,
  };
}

async function main() {
  const config = parseArgs();
  const baseSeed = normalizeSeed(config.seed ?? 1);
  const systems = resolveSystems(config);

  const BSPEngine = await loadBSPEngine();

  const suite = [];
  for (const systemId of systems) {
    const scorer = await loadScorer(systemId);
    const systemDir = path.join(__dirname, systemId);
    const trainPath = path.join(systemDir, 'train.txt');
    const testPath = path.join(systemDir, 'test.txt');

    const trainLines = await loadTrainLines(trainPath, Math.max(1, Number(config.trainLimit) || 1));
    const testCases = await loadTestCases(testPath, scorer, Math.max(1, Number(config.testLimit) || 1));

    suite.push({ systemId, scorer, trainLines, testCases });
  }

  const baseVariant = {
    learnerTopK: 16,
    maxDepth: 3,
    rlPressure: 0.3,
    ngramSizes: [1],
    maxGroupsPerIdentity: 256,
  };

  const sweeps = buildDefaultSweeps().filter((s) => config.sweep === 'all' || s.id === config.sweep);
  if (sweeps.length === 0) {
    throw new Error(`Unknown sweep=${config.sweep}`);
  }

  const out = {
    schema: 'bsp_abstract_primitives_ablations',
    schemaVersion: 1,
    baseSeed,
    config: {
      systems,
      trainLimit: config.trainLimit,
      testLimit: config.testLimit,
      baseVariant,
    },
    sweeps: [],
  };

  console.log(`Systems: ${systems.join(', ')}`);
  console.log(`trainLimit=${config.trainLimit} testLimit=${config.testLimit} seed=${baseSeed}`);

  for (const sweep of sweeps) {
    console.log(`\n=== Sweep: ${sweep.id} ===`);
    const variants = [];

    variants.push(await runVariant(BSPEngine, suite, baseVariant, config));
    for (const v of sweep.values) {
      const variant = sweep.apply(baseVariant, v);
      variants.push(await runVariant(BSPEngine, suite, variant, config));
    }

    variants.sort((a, b) => {
      if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    out.sweeps.push({ id: sweep.id, variants });

    const best = variants[0];
    console.log(`best avg=${best.averageScore.toFixed(1)}%  ${best.label}`);
  }

  const outDir = getResultsDir(config);
  ensureDirSync(outDir);
  const outPath = path.join(outDir, 'ablations.json');
  const summaryPath = path.join(outDir, 'ablations_summary.txt');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(summaryPath, formatSummary(out));
  console.log(`\nAblations saved to: ${outPath}`);
  console.log(`Summary saved to: ${summaryPath}`);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
