/**
 * BSP Demo Script
 * Interactive demo of BSP capabilities
 */

const readline = require('readline');
const { BSPEngine } = require('../src/core');

// Create engine
const engine = new BSPEngine({
  universeSize: 50000,
  maxGroups: 5000,
  rlPressure: 0.3,
  useVocab: true, // Use vocabulary for better interpretability
});

// Sample data to pre-train
const pretrainData = [
  "The cat sat on the mat",
  "Dogs are loyal animals",
  "Cats and dogs are common pets",
  "The dog ran in the park",
  "Birds fly in the sky",
  "Fish swim in the water",
  "The sun is bright today",
  "Rain falls from clouds",
  "Trees grow in forests",
  "Flowers bloom in spring",
];

console.log('='.repeat(60));
console.log('BSP Interactive Demo');
console.log('='.repeat(60));
console.log('');
console.log('Commands:');
console.log('  /stats     - Show statistics');
console.log('  /groups    - Show learned groups');
console.log('  /predict   - Show predictions from current context');
console.log('  /reset     - Reset context');
console.log('  /rl <0-1>  - Set RL pressure');
console.log('  /quit      - Exit');
console.log('  +++        - Positive feedback');
console.log('  ---        - Negative feedback');
console.log('');

// Pre-train
console.log('Pre-training on sample data...');
for (const text of pretrainData) {
  engine.process(text);
}
console.log(`Pre-training complete. Groups: ${engine.store.size}`);
console.log('');
console.log('Start typing to interact!\n');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'You> ',
});

rl.prompt();

rl.on('line', (line) => {
  const input = line.trim();
  
  if (!input) {
    rl.prompt();
    return;
  }
  
  // Handle commands
  if (input === '/quit' || input === '/exit') {
    console.log('Goodbye!');
    process.exit(0);
  }
  
  if (input === '/stats') {
    const stats = engine.getStats();
    console.log('\nStatistics:');
    console.log(`  Steps: ${stats.step}`);
    console.log(`  Groups: ${stats.groupCount}`);
    console.log(`  Edges: ${stats.edgeCount}`);
    console.log(`  RL Pressure: ${stats.rlPressure}`);
    console.log(`  Avg Surprise: ${stats.metrics.avgSurprise.toFixed(2)}`);
    console.log(`  Avg Reward: ${stats.metrics.avgReward.toFixed(2)}`);
    console.log('');
    rl.prompt();
    return;
  }
  
  if (input === '/groups') {
    console.log('\nTop Groups:');
    const groups = engine.getTopGroups(10);
    for (let i = 0; i < groups.length; i++) {
      console.log(`  ${i + 1}. ${groups[i].description}`);
    }
    console.log('');
    rl.prompt();
    return;
  }
  
  if (input === '/predict') {
    if (engine.context.length === 0) {
      console.log('\nNo context. Type something first.\n');
    } else {
      console.log('\nPredictions from current context:');
      const predictions = engine.predictNext(engine.context, 5);
      for (const pred of predictions) {
        console.log(`  ${engine.describeGroup(pred.groupId)} (score: ${pred.score.toFixed(3)})`);
      }
      console.log('');
    }
    rl.prompt();
    return;
  }
  
  if (input === '/reset') {
    engine.resetContext();
    console.log('\nContext reset.\n');
    rl.prompt();
    return;
  }
  
  if (input.startsWith('/rl ')) {
    const value = parseFloat(input.substring(4));
    if (!isNaN(value) && value >= 0 && value <= 1) {
      engine.setRLPressure(value);
      console.log(`\nRL pressure set to ${value}\n`);
    } else {
      console.log('\nInvalid value. Use: /rl 0.5\n');
    }
    rl.prompt();
    return;
  }
  
  // Handle feedback
  let reward = 0;
  if (input.includes('+++') || input.includes('👍')) {
    reward = 0.5;
  } else if (input.includes('---') || input.includes('👎')) {
    reward = -0.5;
  }
  
  // Process input
  const result = engine.process(input, { reward });
  
  // Display response
  console.log('');
  console.log('BSP> Processed input');
  console.log(`      Surprise: ${result.surprise} / ${result.inputSize} bits (${(result.surprise/result.inputSize*100).toFixed(1)}%)`);
  console.log(`      Importance: ${result.importance.toFixed(2)}`);
  
  if (result.activeGroups.length > 0) {
    console.log(`      Active concepts: ${result.activeGroups.slice(0, 3).map(g => engine.describeGroup(g.id)).join(', ')}`);
  }
  
  if (result.predictions.length > 0) {
    console.log(`      Predicts next: ${result.predictions.slice(0, 2).map(p => engine.describeGroup(p.groupId)).join(', ')}`);
  }
  
  if (reward !== 0) {
    console.log(`      Reward: ${reward > 0 ? '+' : ''}${reward}`);
  }
  
  console.log('');
  rl.prompt();
});

rl.on('close', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});
