import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

function getAllTestFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      files.push(...getAllTestFiles(full));
    } else if (ent.isFile() && ent.name.endsWith('.test.mjs')) {
      files.push(full);
    }
  }
  return files;
}

function createAssertions() {
  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${util.inspect(expected)} but got ${util.inspect(actual)}`);
    }
  }

  function assertDeepEqual(actual, expected, message) {
    if (!util.isDeepStrictEqual(actual, expected)) {
      throw new Error(message || `Expected deep equality.\nExpected: ${util.inspect(expected)}\nActual:   ${util.inspect(actual)}`);
    }
  }

  return { assert, assertEqual, assertDeepEqual };
}

function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms${label ? `: ${label}` : ''}`)), timeoutMs);
      t.unref?.();
    }),
  ]);
}

async function run() {
  const tests = [];

  global.test = (name, fn, options = {}) => {
    tests.push({
      name,
      fn,
      timeoutMs: options.timeoutMs ?? 2000,
      tags: Array.isArray(options.tags) ? options.tags : [],
    });
  };

  const { assert, assertEqual, assertDeepEqual } = createAssertions();
  global.assert = assert;
  global.assertEqual = assertEqual;
  global.assertDeepEqual = assertDeepEqual;

  const __filename = fileURLToPath(import.meta.url);
  const baseDir = path.dirname(__filename);
  const unitDir = path.join(baseDir, 'unit');
  const integrationDir = path.join(baseDir, 'integration');
  const perfDir = path.join(baseDir, 'perf');

  const includePerf = process.env.BSP_TEST_PERF === '1';

  const files = [
    ...(fs.existsSync(unitDir) ? getAllTestFiles(unitDir) : []),
    ...(fs.existsSync(integrationDir) ? getAllTestFiles(integrationDir) : []),
    ...(includePerf && fs.existsSync(perfDir) ? getAllTestFiles(perfDir) : []),
  ];

  for (const file of files) {
    await import(pathToFileURL(file).href);
  }

  let passed = 0;
  let failed = 0;

  console.log('='.repeat(60));
  console.log('BSP Test Suite');
  console.log('='.repeat(60));
  console.log(`Loaded ${tests.length} tests from ${files.length} files`);
  if (includePerf) console.log('Including perf tests (BSP_TEST_PERF=1)');

  for (const tc of tests) {
    try {
      await withTimeout((async () => { await tc.fn(); })(), tc.timeoutMs, tc.name);
      console.log(`  ✓ ${tc.name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${tc.name}`);
      console.log(`    Error: ${err && err.message ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  // Always exit explicitly so stray timers (e.g. server/session cleanup intervals)
  // cannot hang the test run.
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
