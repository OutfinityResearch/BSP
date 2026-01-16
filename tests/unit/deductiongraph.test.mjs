import { DeductionGraph } from '../../src/core/index.mjs';

function totalForwardEdges(graph) {
  let count = 0;
  for (const targets of graph.forward.values()) count += targets.size;
  return count;
}

function assertGraphInvariants(graph) {
  // forward -> backward consistency
  for (const [from, targets] of graph.forward) {
    for (const [to, weight] of targets) {
      const back = graph.backward.get(to);
      assert(back && back.has(from), `Missing backward entry for ${from} -> ${to}`);
      assertEqual(back.get(from), weight, `Weight mismatch for ${from} -> ${to}`);
    }
  }

  // no backward-only edges
  for (const [to, sources] of graph.backward) {
    for (const [from, weight] of sources) {
      const fwd = graph.forward.get(from);
      assert(fwd && fwd.has(to), `Backward-only edge exists for ${from} -> ${to}`);
      assertEqual(fwd.get(to), weight, `Weight mismatch for backward-only check ${from} -> ${to}`);
    }
  }

  assertEqual(graph.edgeCount, totalForwardEdges(graph), 'edgeCount must equal total forward edges');
}

test('DeductionGraph: strengthen accumulates weights', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 0.5);
  graph.strengthen(1, 2, 0.5);
  assertEqual(graph.getDeductions(1).get(2), 1.0);
});

test('DeductionGraph: predictDirect returns targets', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 1.0);
  graph.strengthen(1, 3, 0.5);
  const predictions = graph.predictDirect([1]);
  assertEqual(predictions.size, 2);
});

test('DeductionGraph: predictMultiHop reaches deeper nodes', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 1.0);
  graph.strengthen(2, 3, 1.0);
  const predictions = graph.predictMultiHop([1], { maxDepth: 2 });
  assert(predictions.has(3));
});

test('DeductionGraph: pruning preserves invariants and edgeCount', () => {
  const graph = new DeductionGraph({ maxEdgesPerNode: 10 });
  for (let i = 0; i < 25; i++) {
    graph.strengthen(1, 100 + i, i + 1);
  }

  assertGraphInvariants(graph);
  assertEqual(graph.getDeductions(1).size, 10, 'pruning must cap outgoing edges');
});

test('DeductionGraph: removeGroup after pruning does not corrupt edgeCount', () => {
  const graph = new DeductionGraph({ maxEdgesPerNode: 5 });
  for (let i = 0; i < 20; i++) {
    graph.strengthen(1, 200 + i, i + 1);
  }

  assertGraphInvariants(graph);
  graph.removeGroup(1);
  assertGraphInvariants(graph);
  assertEqual(graph.edgeCount, 0);
});

test('DeductionGraph: weaken updates weights and removes edges at zero', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 1.5);

  graph.weaken(1, 2, 0.5);
  assertGraphInvariants(graph);
  assert(Math.abs(graph.getDeductions(1).get(2) - 1.0) < 1e-12, 'weaken must reduce weight');
  assertEqual(graph.edgeCount, 1);

  graph.weaken(1, 2, 1.0);
  assertGraphInvariants(graph);
  assertEqual(graph.getDeductions(1).size, 0);
  assertEqual(graph.getBackward(2).size, 0);
  assertEqual(graph.edgeCount, 0);
});

test('DeductionGraph: applyDecay prunes tiny edges and preserves invariants', () => {
  const graph = new DeductionGraph({ decayFactor: 0.1 });
  graph.strengthen(1, 2, 0.05); // will decay below 0.01 => removed
  graph.strengthen(1, 3, 0.2);  // will decay to 0.02 => kept

  graph.applyDecay();
  assertGraphInvariants(graph);
  assert(!graph.getDeductions(1).has(2), 'decayed edge below threshold must be removed');

  const w = graph.getDeductions(1).get(3);
  assert(typeof w === 'number' && w > 0, 'decayed edge should remain with positive weight');
  assert(Math.abs(w - 0.02) < 1e-6, 'decayed weight should match expected value');
});

test('DeductionGraph: mergeNodes redirects edges and removes source', () => {
  const graph = new DeductionGraph();
  graph.strengthen(2, 3, 0.5);  // outgoing from source
  graph.strengthen(4, 2, 0.7);  // incoming to source

  graph.mergeNodes(1, 2);
  assertGraphInvariants(graph);

  assert(!graph.forward.has(2), 'source node should have no outgoing edges after merge');
  assert(!graph.backward.has(2), 'source node should have no incoming edges after merge');

  const out = graph.getDeductions(1);
  assert(out.has(3), 'target node should inherit outgoing edges');
  assert(Math.abs(out.get(3) - 0.5) < 1e-12);

  const back = graph.getBackward(1);
  assert(back.has(4), 'target node should inherit incoming edges');
  assert(Math.abs(back.get(4) - 0.7) < 1e-12);
});

test('DeductionGraph: toJSON/fromJSON preserves edges and invariants', () => {
  const graph = new DeductionGraph({ threshold: 0.9, decayFactor: 0.5, maxEdgesPerNode: 50 });
  graph.strengthen(1, 2, 1.0);
  graph.strengthen(2, 3, 0.4);

  const restored = DeductionGraph.fromJSON(graph.toJSON());
  assertGraphInvariants(restored);
  assertEqual(restored.edgeCount, graph.edgeCount);
  assertEqual(restored.threshold, 0.9);
  assertEqual(restored.decayFactor, 0.5);
  assertEqual(restored.maxEdgesPerNode, 50);
});
