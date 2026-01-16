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
