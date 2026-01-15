const { BPCMServer } = require('../src/server/Server');

const server = new BPCMServer({ port: 3008 });
server.start();

setTimeout(async () => {
  try {
    const createRes = await fetch('http://localhost:3008/api/sessions', { method: 'POST' });
    const session = await createRes.json();
    console.log('\n=== Session created with NEW Engine ===');
    
    // Test 1: Sequence Generation
    // Expecting a coherent phrase, not just random words
    console.log('\n--- Test 1: Sequence Generation ---');
    const msg1 = await fetch(`http://localhost:3008/api/sessions/${session.sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'The ship sailed across the ocean.' })
    });
    const r1 = await msg1.json();
    console.log('Input: The ship sailed across the ocean.');
    console.log('Response:', r1.response);
    
    // Test 2: Context Maintenance
    // Second message should relate to the first one
    console.log('\n--- Test 2: Context Maintenance ---');
    const msg2 = await fetch(`http://localhost:3008/api/sessions/${session.sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'The captain looked at the map.' })
    });
    const r2 = await msg2.json();
    console.log('Input: The captain looked at the map.');
    console.log('Response:', r2.response);
    
    // Check if context stats show active topics
    if (r2.contextStats) {
      console.log('Active Topics:', r2.contextStats.activeTopics);
      console.log('Context Keywords:', r2.contextStats.keywords);
    }
    
    // Test 3: Specialization (Content words)
    console.log('\n--- Test 3: Content vs Stopwords ---');
    const msg3 = await fetch(`http://localhost:3008/api/sessions/${session.sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Sherlock Holmes solved the mysterious crime.' })
    });
    const r3 = await msg3.json();
    console.log('Input: Sherlock Holmes solved the mysterious crime.');
    console.log('Response:', r3.response);
    
    // Validate response quality
    const hasContent = !['and', 'the', 'to', 'of'].includes(r3.response.split(' ')[0]);
    console.log('Starts with content word?', hasContent ? 'YES' : 'NO');
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    server.stop();
    process.exit(0);
  }
}, 2000);
