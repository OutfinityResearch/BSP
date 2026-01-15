/**
 * BSP Full Training Example
 * Demonstrates training with more data and proper group/deduction formation
 */

import fs from 'node:fs';
import path from 'node:path';

import { BSPEngine } from '../src/core/index.mjs';

// Extended training corpus
const TRAINING_DATA = `
The cat sat on the mat and looked at the bird.
The dog ran in the park chasing a ball.
Birds fly high in the blue sky above the trees.
Fish swim in the deep ocean water near coral reefs.
The sun rises in the east every morning.
Rain falls from dark clouds during storms.
Trees grow tall in forests and provide shade.
Flowers bloom in spring with beautiful colors.
The cat chased the mouse across the kitchen floor.
Dogs are loyal companions and love their owners.
Birds build nests in trees to raise their young.
Fish have scales and breathe through gills.
The sun sets in the west painting the sky orange.
Snow falls in winter covering the ground white.
Leaves change color in autumn before falling.
Seeds grow into plants when given water and light.
The cat sleeps on the warm windowsill.
The dog barks at strangers approaching the house.
Birds sing songs early in the morning.
Fish swim in schools for protection from predators.
Cats hunt mice and small creatures at night.
Dogs fetch sticks and balls when playing.
Birds migrate south during cold winter months.
Fish lay eggs in shallow water near plants.
The weather is sunny today with clear skies.
It will rain tomorrow according to the forecast.
Temperature rises during summer and falls in winter.
Wind blows leaves across the yard in autumn.
Machine learning is a subset of artificial intelligence.
Neural networks can learn complex patterns from data.
Deep learning uses multiple layers for better accuracy.
Algorithms process information to solve problems.
Data structures organize information efficiently.
Programming languages include Python and JavaScript.
Computers execute instructions written by programmers.
Software applications run on hardware devices.
Machine learning models need training data.
Neural networks have weights and biases.
Deep learning requires significant computing power.
Algorithms can be optimized for better performance.
Data flows through the network layer by layer.
Programs are written in high level languages.
Computers store data in memory and on disk.
Software developers write and test code daily.
The quick brown fox jumps over the lazy dog.
A journey of a thousand miles begins with one step.
Knowledge is power and education is the key.
Practice makes perfect through consistent effort.
Time flies when you are having fun.
Actions speak louder than words in most situations.
Every cloud has a silver lining.
The early bird catches the worm.
`.trim().split('\n').filter(l => l.trim());

async function train() {
  console.log('='.repeat(60));
  console.log('BSP Extended Training');
  console.log('='.repeat(60));
  console.log(`Training samples: ${TRAINING_DATA.length}`);
  console.log('');

  const engine = new BSPEngine({
    universeSize: 50000,
    maxGroups: 5000,
    rlPressure: 0.3,
    useVocab: true, // For interpretability
  });

  const epochs = 10;
  const startTime = Date.now();

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalSurprise = 0;
    let totalInput = 0;
    
    // Shuffle data each epoch
    const shuffled = [...TRAINING_DATA].sort(() => Math.random() - 0.5);
    
    for (const line of shuffled) {
      const result = engine.process(line);
      totalSurprise += result.surprise;
      totalInput += result.inputSize;
    }
    
    const surpriseRate = totalSurprise / totalInput;
    
    console.log(`Epoch ${epoch + 1}/${epochs}: ` +
      `Surprise=${(surpriseRate * 100).toFixed(1)}% ` +
      `Groups=${engine.store.size} ` +
      `Edges=${engine.graph.edgeCount}`);
    
    // Consolidation
    if (epoch < epochs - 1 && engine.buffer.size > 20) {
      engine.consolidate(20);
    }
  }

  const totalTime = Date.now() - startTime;
  
  console.log('');
  console.log('='.repeat(60));
  console.log('Training Complete');
  console.log('='.repeat(60));
  console.log(`Time: ${(totalTime/1000).toFixed(1)}s`);
  console.log(`Groups: ${engine.store.size}`);
  console.log(`Deductions: ${engine.graph.edgeCount}`);
  console.log(`Buffer: ${engine.buffer.size}`);
  
  // Show learned concepts
  console.log('\n--- Top Learned Concepts ---');
  const topGroups = engine.getTopGroups(15);
  for (let i = 0; i < topGroups.length; i++) {
    console.log(`${i + 1}. ${topGroups[i].description}`);
  }
  
  // Test predictions
  console.log('\n--- Prediction Tests ---');
  
  const testCases = [
    'The cat',
    'Machine learning',
    'Birds fly',
    'The dog',
  ];
  
  for (const test of testCases) {
    engine.resetContext();
    const result = engine.process(test, { learn: false });
    const predictions = engine.predictNext(result.activeGroupIds, 3);
    
    console.log(`\nInput: "${test}"`);
    console.log(`  Active: ${result.activeGroups.slice(0, 2).map(g => engine.describeGroup(g.id)).join(', ') || 'none'}`);
    
    if (predictions.length > 0) {
      console.log(`  Predicts: ${predictions.map(p => engine.describeGroup(p.groupId)).join(', ')}`);
    } else {
      console.log(`  Predicts: (no predictions yet)`);
    }
  }
  
  // Save model
  const modelPath = 'data/model_extended.json';
  fs.mkdirSync(path.dirname(modelPath), { recursive: true });
  fs.writeFileSync(modelPath, JSON.stringify(engine.toJSON()));
  console.log(`\nModel saved to ${modelPath}`);
  
  // Final evaluation
  console.log('\n--- Final Evaluation ---');
  let evalSurprise = 0;
  let evalInput = 0;
  
  for (const line of TRAINING_DATA.slice(0, 20)) {
    const result = engine.process(line, { learn: false });
    evalSurprise += result.surprise;
    evalInput += result.inputSize;
  }
  
  console.log(`Final surprise rate: ${(evalSurprise / evalInput * 100).toFixed(1)}%`);
}

train().catch(console.error);
