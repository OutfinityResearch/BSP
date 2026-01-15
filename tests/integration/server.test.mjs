import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BSPServer } from '../../src/server/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requestJson({ host, port, method, urlPath, body, timeoutMs = 1500 }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: host,
      port,
      path: urlPath,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, json, text });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

test('Server API: create session, chat, save, list saved', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-tests-'));
  const server = new BSPServer({
    host: '127.0.0.1',
    port: 0,
    sessionsDir: tmpDir,
    publicDir: path.join(__dirname, '../../public'),
  });

  try {
    try {
      await server.start();
    } catch (err) {
      // Some sandboxed environments do not allow binding/listening on sockets.
      // Treat that as a skipped integration test.
      if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return;
      throw err;
    }
    const port = server.port;

    const create = await requestJson({ host: '127.0.0.1', port, method: 'POST', urlPath: '/api/sessions' });
    assertEqual(create.status, 200);
    assert(create.json && typeof create.json.sessionId === 'string', 'should return sessionId');

    const sessionId = create.json.sessionId;

    const msg = await requestJson({
      host: '127.0.0.1',
      port,
      method: 'POST',
      urlPath: `/api/sessions/${sessionId}/messages`,
      body: { content: 'Hello from tests' },
    });
    assertEqual(msg.status, 200);
    assert(msg.json && typeof msg.json.response === 'string', 'should return response text');

    const save = await requestJson({ host: '127.0.0.1', port, method: 'POST', urlPath: `/api/sessions/${sessionId}/save` });
    assertEqual(save.status, 200);
    assert(save.json && save.json.path, 'save should return path');
    assert(fs.existsSync(save.json.path), 'saved session file should exist');

    const saved = await requestJson({ host: '127.0.0.1', port, method: 'GET', urlPath: '/api/sessions/saved' });
    assertEqual(saved.status, 200);
    assert(Array.isArray(saved.json.sessions), 'saved sessions should be an array');
    assert(saved.json.sessions.some((s) => s.id === sessionId), 'saved sessions should include session');
  } finally {
    try {
      await server.stop();
    } catch (_) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}, { timeoutMs: 8000 });
