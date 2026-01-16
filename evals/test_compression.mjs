#!/usr/bin/env node
/**
 * Test script for compression improvements (DS-020, DS-021)
 * 
 * Tests:
 * 1. Adaptive Universe - measures BPC improvement with dynamic universe sizing
 * 2. CompressionMachine - measures savings from COPY, REPEAT operators
 * 
 * Usage:
 *   node test_compression.mjs
 */

import { BSPEngine, CompressionMachine } from '../src/core/index.mjs';

const TEST_SENTENCES = [
  // Repetitive patterns
  "the cat sat the cat sat the cat sat",
  "one two three one two three one two three",
  "hello world hello world hello world",
  
  // Template-like patterns
  "the dog is happy",
  "the cat is sad",
  "the bird is hungry",
  "the fish is small",
  
  // Narrative with copy potential
  "once upon a time there was a little girl",
  "the little girl went to the forest",
  "in the forest she found a house",
  "the house was made of candy",
  
  // More natural language
  "tom and lily were best friends",
  "they played together every day",
  "one day tom found a magic stone",
  "the magic stone could grant wishes",
];

function testAdaptiveUniverse() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST 1: ADAPTIVE UNIVERSE (DS-020)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Fixed universe engine
  const fixedEngine = new BSPEngine({
    universeSize: 100000,
    adaptiveUniverse: false,
    useVocab: true,
    maxGroups: 5000,
  });

  // Adaptive universe engine
  const adaptiveEngine = new BSPEngine({
    universeSize: 100000,
    adaptiveUniverse: true,
    useVocab: true,
    maxGroups: 5000,
  });

  let fixedTotalBits = 0;
  let adaptiveTotalBits = 0;
  let totalChars = 0;

  console.log('Training and measuring...\n');
  console.log('Sentence                                  | Fixed Cost | Adaptive Cost | Savings');
  console.log('─'.repeat(85));

  for (const sentence of TEST_SENTENCES) {
    const fixedResult = fixedEngine.process(sentence);
    const adaptiveResult = adaptiveEngine.process(sentence);

    const fixedCost = fixedResult.surprise * Math.log2(100000);
    const adaptiveCost = adaptiveResult.mdlCost;
    const savings = ((fixedCost - adaptiveCost) / fixedCost * 100) || 0;

    fixedTotalBits += fixedCost;
    adaptiveTotalBits += adaptiveCost;
    totalChars += sentence.length;

    const preview = sentence.slice(0, 40).padEnd(40);
    console.log(`${preview} | ${fixedCost.toFixed(1).padStart(10)} | ${adaptiveCost.toFixed(1).padStart(13)} | ${savings.toFixed(1).padStart(6)}%`);
  }

  console.log('─'.repeat(85));

  const fixedBPC = fixedTotalBits / totalChars;
  const adaptiveBPC = adaptiveTotalBits / totalChars;
  const improvement = (fixedBPC - adaptiveBPC) / fixedBPC * 100;

  console.log(`\nSUMMARY:`);
  console.log(`  Fixed Universe BPC:    ${fixedBPC.toFixed(3)} bits/char`);
  console.log(`  Adaptive Universe BPC: ${adaptiveBPC.toFixed(3)} bits/char`);
  console.log(`  Improvement:           ${improvement.toFixed(1)}%`);
  console.log(`  Effective Universe:    ${adaptiveEngine.effectiveUniverseSize} (vocab: ${adaptiveEngine.vocabTracker.size})`);

  return { fixedBPC, adaptiveBPC, improvement };
}

function testCompressionMachine() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST 2: COMPRESSION MACHINE (DS-021)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const machine = new CompressionMachine({
    vocabSize: 1000,
    maxContextLen: 128,
    minCopyLen: 2,
  });

  let totalLiteralCost = 0;
  let totalProgramCost = 0;
  let context = [];

  console.log('Testing operators...\n');
  console.log('Input                                     | Literal | Program | Savings | Program');
  console.log('─'.repeat(100));

  for (const sentence of TEST_SENTENCES) {
    const tokens = sentence.toLowerCase().split(/\s+/);
    
    const literalCost = tokens.length * Math.log2(machine.vocabSize);
    const program = machine.encode(tokens, context);
    const programCost = program.cost;
    const savings = ((literalCost - programCost) / literalCost * 100) || 0;

    totalLiteralCost += literalCost;
    totalProgramCost += programCost;

    // Update context
    context = [...context, ...tokens].slice(-machine.maxContextLen);

    const preview = sentence.slice(0, 40).padEnd(40);
    const progStr = program.toString().slice(0, 30);
    console.log(`${preview} | ${literalCost.toFixed(1).padStart(7)} | ${programCost.toFixed(1).padStart(7)} | ${savings.toFixed(1).padStart(6)}% | ${progStr}`);
  }

  console.log('─'.repeat(100));

  const literalBPC = totalLiteralCost / TEST_SENTENCES.join(' ').length;
  const programBPC = totalProgramCost / TEST_SENTENCES.join(' ').length;
  const improvement = (literalBPC - programBPC) / literalBPC * 100;

  console.log(`\nSUMMARY:`);
  console.log(`  Literal encoding BPC: ${literalBPC.toFixed(3)} bits/char`);
  console.log(`  Program encoding BPC: ${programBPC.toFixed(3)} bits/char`);
  console.log(`  Improvement:          ${improvement.toFixed(1)}%`);
  console.log(`  Stats:`, machine.getStats());

  return { literalBPC, programBPC, improvement };
}

function testCombined() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST 3: COMBINED (Adaptive Universe + Compression Machine)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const engine = new BSPEngine({
    universeSize: 100000,
    adaptiveUniverse: true,
    useVocab: true,
    maxGroups: 5000,
  });

  const machine = new CompressionMachine({
    vocabSize: 10000,
    maxContextLen: 128,
    minCopyLen: 2,
  });

  let baselineTotalBits = 0;  // Fixed universe, no machine
  let combinedTotalBits = 0;  // Adaptive + machine
  let totalChars = 0;
  let context = [];

  for (const sentence of TEST_SENTENCES) {
    const tokens = sentence.toLowerCase().split(/\s+/);
    
    // Baseline: fixed universe cost
    const baselineResult = engine.process(sentence);
    const baselineCost = baselineResult.surprise * Math.log2(100000);
    
    // Combined: adaptive + compression machine
    const program = machine.encode(tokens, context);
    const machineCost = program.cost;
    const adaptiveGroupCost = engine.computeMDLCost(baselineResult.surprise);
    
    // Take the better of: machine encoding OR adaptive group encoding
    const combinedCost = Math.min(machineCost, adaptiveGroupCost);

    baselineTotalBits += baselineCost;
    combinedTotalBits += combinedCost;
    totalChars += sentence.length;

    // Update context
    context = [...context, ...tokens].slice(-machine.maxContextLen);
  }

  const baselineBPC = baselineTotalBits / totalChars;
  const combinedBPC = combinedTotalBits / totalChars;
  const improvement = (baselineBPC - combinedBPC) / baselineBPC * 100;

  console.log(`  Baseline BPC (fixed, no machine): ${baselineBPC.toFixed(3)} bits/char`);
  console.log(`  Combined BPC (adaptive + machine): ${combinedBPC.toFixed(3)} bits/char`);
  console.log(`  TOTAL IMPROVEMENT:                 ${improvement.toFixed(1)}%`);

  return { baselineBPC, combinedBPC, improvement };
}

// Run tests
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║         BSP COMPRESSION IMPROVEMENT TESTS                     ║');
console.log('║         DS-020 (Adaptive Universe) + DS-021 (Machine)         ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');

const adaptiveResults = testAdaptiveUniverse();
const machineResults = testCompressionMachine();
const combinedResults = testCombined();

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    FINAL SUMMARY                               ║');
console.log('╠═══════════════════════════════════════════════════════════════╣');
console.log(`║  Adaptive Universe alone:  ${adaptiveResults.improvement.toFixed(1).padStart(5)}% improvement                   ║`);
console.log(`║  Compression Machine alone: ${machineResults.improvement.toFixed(1).padStart(5)}% improvement                   ║`);
console.log(`║  Combined:                  ${combinedResults.improvement.toFixed(1).padStart(5)}% improvement                   ║`);
console.log('╚═══════════════════════════════════════════════════════════════╝');
