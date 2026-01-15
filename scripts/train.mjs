/**
 * BSP Training Script
 * Train a model on text data
 */

import fs from 'node:fs';
import path from 'node:path';

import { BSPEngine } from '../src/core/index.mjs';

// Configuration
const CONFIG = {
  dataPath: process.argv[2] || 'data/train.txt',
  outputPath: process.argv[3] || 'data/model.json',
  epochs: parseInt(process.argv[4]) || 3,
  
  // Engine config
  universeSize: 100000,
  maxGroups: 10000,
  rlPressure: 0.3,
};

// Helper to format time
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${(ms/60000).toFixed(1)}m`;
}

// Progress bar
function progressBar(current, total, width = 40) {
  const pct = current / total;
  const filled = Math.round(width * pct);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${(pct * 100).toFixed(1)}%`;
}

async function train() {
  console.log('='.repeat(60));
  console.log('BSP Training Script');
  console.log('='.repeat(60));
  console.log(`Data: ${CONFIG.dataPath}`);
  console.log(`Output: ${CONFIG.outputPath}`);
  console.log(`Epochs: ${CONFIG.epochs}`);
  console.log('');

  // Check if data exists
  if (!fs.existsSync(CONFIG.dataPath)) {
    console.log('Training data not found. Creating sample data...');
    
    // Create sample training data
    const sampleData = `
The quick brown fox jumps over the lazy dog.
Machine learning is a subset of artificial intelligence.
Neural networks can learn complex patterns.
Natural language processing enables computers to understand text.
Deep learning has revolutionized computer vision.
Reinforcement learning teaches agents through rewards.
The cat sat on the mat and watched the birds.
Programming languages include Python, JavaScript, and Java.
Data structures like arrays and trees are fundamental.
Algorithms solve problems efficiently.
The weather is sunny today with clear skies.
Mathematics is the foundation of computer science.
Statistics helps us understand data patterns.
Probability measures the likelihood of events.
Graphs represent relationships between entities.
Trees are hierarchical data structures.
Hash tables provide fast lookup operations.
Sorting algorithms arrange data in order.
Search algorithms find elements in collections.
Recursion solves problems by breaking them down.
`.trim().split('\n').filter(l => l.trim());

    fs.mkdirSync(path.dirname(CONFIG.dataPath), { recursive: true });
    fs.writeFileSync(CONFIG.dataPath, sampleData.join('\n'));
    console.log(`Created sample data with ${sampleData.length} lines\n`);
  }

  // Load training data
  const text = fs.readFileSync(CONFIG.dataPath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  console.log(`Loaded ${lines.length} training lines\n`);

  // Create engine
  const engine = new BSPEngine({
    universeSize: CONFIG.universeSize,
    maxGroups: CONFIG.maxGroups,
    rlPressure: CONFIG.rlPressure,
  });

  const startTime = Date.now();

  // Training loop
  for (let epoch = 0; epoch < CONFIG.epochs; epoch++) {
    console.log(`\nEpoch ${epoch + 1}/${CONFIG.epochs}`);
    console.log('-'.repeat(40));
    
    let epochSurprise = 0;
    const epochStart = Date.now();
    
    for (let i = 0; i < lines.length; i++) {
      const result = engine.process(lines[i]);
      epochSurprise += result.surprise;
      
      // Progress every 10%
      if ((i + 1) % Math.max(1, Math.floor(lines.length / 10)) === 0) {
        process.stdout.write(`\r${progressBar(i + 1, lines.length)} `);
        process.stdout.write(`Surprise: ${result.surprise.toFixed(0)} `);
        process.stdout.write(`Groups: ${engine.store.size} `);
      }
    }
    
    const epochTime = Date.now() - epochStart;
    console.log(`\r${progressBar(lines.length, lines.length)}`);
    console.log(`  Average surprise: ${(epochSurprise / lines.length).toFixed(2)}`);
    console.log(`  Groups: ${engine.store.size}`);
    console.log(`  Edges: ${engine.graph.edgeCount}`);
    console.log(`  Time: ${formatTime(epochTime)}`);
    
    // Consolidation between epochs
    if (epoch < CONFIG.epochs - 1) {
      console.log('  Running consolidation...');
      engine.consolidate(50);
    }
  }

  const totalTime = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('Training Complete!');
  console.log('='.repeat(60));
  console.log(`Total time: ${formatTime(totalTime)}`);
  console.log(`Final groups: ${engine.store.size}`);
  console.log(`Final edges: ${engine.graph.edgeCount}`);
  console.log(`Buffer size: ${engine.buffer.size}`);
  
  // Show top groups
  console.log('\nTop 10 Groups:');
  for (const group of engine.getTopGroups(10)) {
    console.log(`  ${group.description}`);
  }

  // Save model
  console.log(`\nSaving model to ${CONFIG.outputPath}...`);
  fs.mkdirSync(path.dirname(CONFIG.outputPath), { recursive: true });
  const state = engine.toJSON();
  fs.writeFileSync(CONFIG.outputPath, JSON.stringify(state));
  
  const fileSize = fs.statSync(CONFIG.outputPath).size;
  console.log(`Model saved (${(fileSize / 1024).toFixed(1)} KB)`);
  
  console.log('\nDone!');
}

train().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});
