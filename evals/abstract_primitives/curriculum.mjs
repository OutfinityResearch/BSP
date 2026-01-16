/**
 * Curriculum runner for Abstract Primitives (Discovery-only).
 *
 * Trains a single BSPEngine across a suite of systems, progressing difficulty
 * from easy -> medium -> hard once the suite average crosses a threshold.
 *
 * Usage:
 *   node curriculum.mjs --tier=1 --seed=1
 *   node curriculum.mjs --systems=01_convergence,02_divergence --seed=1
 */

import fs from 'node:fs';
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

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const __dirname = new URL('.', import.meta.url).pathname;

async function loadBSPEngine() {
  const mod = await import('../../src/core/index.mjs');
  if (!mod?.BSPEngine) {
    throw new Error('Missing export: BSPEngine');
  }
  return mod.BSPEngine;
}

async function loadGenerator(systemId) {
  const mod = await import(`./${systemId}/generator.mjs`);
  if (typeof mod.createGrammar !== 'function') {
    throw new Error(`Missing export: createGrammar(config) in ${systemId}/generator.mjs`);
  }
  return mod;
}

async function loadScorer(systemId) {
  const mod = await import(`./${systemId}/scorer.mjs`);
  if (typeof mod.parseTestLine !== 'function') {
    throw new Error(`Missing export: parseTestLine(line) in ${systemId}/scorer.mjs`);
  }
  if (typeof mod.score !== 'function') {
    throw new Error(`Missing export: score({engine,prompt,expected,meta,options}) in ${systemId}/scorer.mjs`);
  }
  return mod;
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getResultsDir(config) {
  const baseSeed = normalizeSeed(config.seed ?? 1);
  return path.join(__dirname, 'results', `seed_${baseSeed}`);
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
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

    if (!scored || typeof scored !== 'object') {
      throw new Error('Invalid scorer output');
    }

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

function parseSystems(config) {
  if (config.all) return [...SYSTEMS];
  if (config.tier) {
    const tier = Number(config.tier);
    if (!TIERS[tier]) throw new Error(`Unknown tier=${config.tier}`);
    return [...TIERS[tier]];
  }
  if (config.systems.length > 0) return [...config.systems];
  return [...TIERS[1]];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    all: false,
    tier: null,
    systems: [],
    seed: 1,
    train: 5000,
    test: 500,
    checkpointEvery: 500,
    threshold: 80,
    topKGroups: 20,
    topKTokens: 10,
    maxCheckpoints: 50,
  };

  for (const arg of args) {
    if (arg === '--all') config.all = true;
    else if (arg.startsWith('--tier=')) config.tier = arg.split('=')[1];
    else if (arg.startsWith('--seed=')) config.seed = normalizeSeed(arg.split('=')[1]);
    else if (arg.startsWith('--train=')) config.train = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--test=')) config.test = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--checkpoint-every=')) config.checkpointEvery = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--threshold=')) config.threshold = parseFloat(arg.split('=')[1]);
    else if (arg.startsWith('--topk-groups=')) config.topKGroups = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--topk-tokens=')) config.topKTokens = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--max-checkpoints=')) config.maxCheckpoints = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--systems=')) {
      const raw = arg.split('=')[1] || '';
      config.systems.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--system=')) {
      config.systems.push(arg.split('=')[1]);
    }
  }

  return config;
}

async function main() {
  const config = parseArgs();
  const baseSeed = normalizeSeed(config.seed ?? 1);
  const systems = parseSystems(config).map((s) => {
    const full = SYSTEMS.find((id) => id === s || id.startsWith(s));
    if (!full) throw new Error(`Unknown system=${s}`);
    return full;
  });

  const BSPEngine = await loadBSPEngine();

  let engine = new BSPEngine({
    universeSize: 10000,
    maxGroups: 5000,
    useVocab: true,
    useCompressionMachine: false,
    tokenizerConfig: { ngramSizes: [1] },
  });

  const snapshotAndEval = (fn) => {
    const snap = engine.toJSON();
    const res = fn();
    engine = BSPEngine.fromJSON(snap);
    return res;
  };

  const scoringOptions = {
    topKGroups: config.topKGroups,
    topKTokens: config.topKTokens,
  };

  const suite = [];
  for (const systemId of systems) {
    const scorer = await loadScorer(systemId);
    const generator = await loadGenerator(systemId);
    suite.push({ systemId, scorer, generator });
  }

  const results = {
    schema: 'bsp_abstract_primitives_curriculum',
    schemaVersion: 1,
    baseSeed,
    config: {
      systems,
      train: config.train,
      test: config.test,
      checkpointEvery: config.checkpointEvery,
      threshold: config.threshold,
      topKGroups: config.topKGroups,
      topKTokens: config.topKTokens,
      maxCheckpoints: config.maxCheckpoints,
      difficulties: DIFFICULTIES,
    },
    stages: [],
    events: [],
  };

  let globalStep = 0;

  for (const difficulty of DIFFICULTIES) {
    console.log(`\n=== Curriculum Stage: difficulty=${difficulty} ===`);
    const stage = {
      difficulty,
      startedAtStep: globalStep,
      achieved: false,
      stepsToThreshold: null,
      curve: [],
      systems: {},
    };

    const stageData = new Map();
    for (const { systemId, generator, scorer } of suite) {
      const systemSeed = deriveSeed(baseSeed, `${systemId}:${difficulty}`);
      const rng = createRng(systemSeed);
      const grammar = generator.createGrammar({ rng, difficulty });

      const trainLines = grammar.generateTrainingData(config.train);
      const testLines = grammar.generateTestData(config.test);
      const testCases = testLines.filter(Boolean).map((l) => scorer.parseTestLine(l));

      stageData.set(systemId, { systemSeed, trainLines, testCases });
      stage.systems[systemId] = {
        systemSeed,
        trainLines: trainLines.length,
        testCases: testCases.length,
      };
    }

    const checkpointEvery = Math.max(1, Number(config.checkpointEvery) || 500);
    const maxCheckpoints = Math.max(1, Number(config.maxCheckpoints) || 1);

    const maxTrainLen = Math.max(...[...stageData.values()].map((d) => d.trainLines.length));
    const maxTrainSteps = maxTrainLen * suite.length;

    let checkpointIndex = 0;
    let nextCheckpoint = globalStep;
    let localStep = 0;

    while (localStep < maxTrainSteps && checkpointIndex <= maxCheckpoints) {
      if (globalStep >= nextCheckpoint) {
        const res = snapshotAndEval(() => {
          const perSystem = {};
          const scores = [];
          for (const { systemId, scorer } of suite) {
            const data = stageData.get(systemId);
            const evalRes = evaluateTestCases(engine, scorer, data.testCases, scoringOptions);
            perSystem[systemId] = evalRes;
            scores.push(evalRes.score);
          }
          return { perSystem, averageScore: average(scores) };
        });

        stage.curve.push({
          step: globalStep,
          averageScore: res.averageScore,
          perSystem: Object.fromEntries(Object.entries(res.perSystem).map(([k, v]) => [k, v.score])),
        });

        console.log(`  step=${globalStep} avg=${res.averageScore.toFixed(1)}%`);

        if (!stage.achieved && res.averageScore >= config.threshold) {
          stage.achieved = true;
          stage.stepsToThreshold = globalStep - stage.startedAtStep;
          results.events.push({
            type: 'difficulty_unlocked',
            from: difficulty,
            to: DIFFICULTIES[DIFFICULTIES.indexOf(difficulty) + 1] || null,
            step: globalStep,
            averageScore: res.averageScore,
          });
          console.log(`  threshold reached: ${res.averageScore.toFixed(1)}% >= ${config.threshold}%`);
          break;
        }

        checkpointIndex++;
        nextCheckpoint = globalStep + checkpointEvery;
      }

      // Train one round-robin step across systems.
      for (const { systemId } of suite) {
        const data = stageData.get(systemId);
        const idx = Math.floor(localStep / suite.length);
        if (idx < data.trainLines.length) {
          engine.process(data.trainLines[idx], { learn: true });
        }
        globalStep++;
        localStep++;
        if (localStep >= maxTrainSteps) break;
      }
    }

    stage.finishedAtStep = globalStep;
    results.stages.push(stage);

    if (!stage.achieved) {
      console.log(`  stopping: threshold not reached on difficulty=${difficulty}`);
      break;
    }
  }

  const outDir = getResultsDir(config);
  ensureDirSync(outDir);
  const outPath = path.join(outDir, 'curriculum.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nCurriculum results saved to: ${outPath}`);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
