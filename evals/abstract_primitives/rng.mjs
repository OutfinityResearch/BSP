export function normalizeSeed(seed) {
  const num = Number(seed);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid seed: ${seed}`);
  }
  return (num | 0) >>> 0;
}

export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function deriveSeed(baseSeed, salt) {
  const seed = normalizeSeed(baseSeed);
  return fnv1a32(`${seed}:${String(salt)}`);
}

export function createRng(seed) {
  let t = normalizeSeed(seed);
  return function rng() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

