import { DeductionGraph } from '../../src/core/index.mjs';

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
