import { SimpleBitset } from '../../src/core/index.mjs';

test('SimpleBitset: add/has/remove', () => {
  const bs = new SimpleBitset(1000);
  bs.add(42);
  bs.add(100);
  assert(bs.has(42), 'should have 42');
  assert(bs.has(100), 'should have 100');
  assert(!bs.has(50), 'should not have 50');

  bs.remove(42);
  assert(!bs.has(42), 'should not have 42 after remove');
});

test('SimpleBitset: size (popcount) and iterator', () => {
  const bs = new SimpleBitset(1000);
  bs.add(1);
  bs.add(2);
  bs.add(3);
  assertEqual(bs.size, 3);

  const arr = [...bs];
  assertDeepEqual(arr.sort((a, b) => a - b), [1, 2, 3]);
});

test('SimpleBitset: and/or/andNot', () => {
  const a = SimpleBitset.fromArray([1, 2, 3, 4], 1000);
  const b = SimpleBitset.fromArray([3, 4, 5, 6], 1000);

  const i = a.and(b);
  assertEqual(i.size, 2);
  assert(i.has(3) && i.has(4));

  const u = SimpleBitset.fromArray([1, 2], 1000).or(SimpleBitset.fromArray([3, 4], 1000));
  assertEqual(u.size, 4);

  const d = SimpleBitset.fromArray([1, 2, 3], 1000).andNot(SimpleBitset.fromArray([2, 3, 4], 1000));
  assertEqual(d.size, 1);
  assert(d.has(1));
});

test('SimpleBitset: toJSON/fromJSON roundtrip', () => {
  const a = SimpleBitset.fromArray([10, 20, 30], 1000);
  const json = a.toJSON();
  const b = SimpleBitset.fromJSON(json);
  assertEqual(b.size, 3);
  assert(b.has(10) && b.has(20) && b.has(30));
});

test('SimpleBitset: andCardinality matches intersection size', () => {
  const a = SimpleBitset.fromArray([1, 2, 3, 4, 10], 128);
  const b = SimpleBitset.fromArray([3, 4, 5, 6, 10, 11], 128);
  const intersection = a.and(b);
  assertEqual(a.andCardinality(b), intersection.size);
  assertEqual(b.andCardinality(a), intersection.size);
});

test('SimpleBitset: jaccard is symmetric and in [0,1]', () => {
  const a = SimpleBitset.fromArray([1, 2, 3], 128);
  const b = SimpleBitset.fromArray([2, 3, 4, 5], 128);
  const j1 = a.jaccard(b);
  const j2 = b.jaccard(a);
  assert(Math.abs(j1 - j2) < 1e-12, 'jaccard must be symmetric');
  assert(j1 >= 0 && j1 <= 1, 'jaccard must be within [0,1]');

  assertEqual(a.jaccard(a), 1);
  assertEqual(a.jaccard(SimpleBitset.fromArray([], 128)), 0);
});

test('SimpleBitset: toJSON/fromJSON dense roundtrip', () => {
  const maxSize = 256;
  const bits = Array.from({ length: 96 }, (_, i) => i);
  const a = SimpleBitset.fromArray(bits, maxSize);
  const json = a.toJSON();
  assertEqual(json.type, 'dense');

  const b = SimpleBitset.fromJSON(json);
  assertEqual(b.maxSize, maxSize);
  assertEqual(b.size, a.size);
  for (const bit of bits) {
    assert(b.has(bit), `Missing bit ${bit} after dense roundtrip`);
  }
});
