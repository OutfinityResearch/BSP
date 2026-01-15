/**
 * HTTP Server for BSP Chat Interface
 * No external dependencies - uses Node.js built-in http module
 */

import http from 'node:http';
import fs from 'node:fs';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { BSPEngine } from '../core/BSPEngine.mjs';
import { ResponseGenerator } from '../core/ResponseGenerator.mjs';
import { ConversationContext } from '../core/ConversationContext.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to pretrained model
const PRETRAINED_MODEL_PATH = path.join(__dirname, '../../data/pretrained.json');

/**
 * Load pretrained model if available
 * @returns {object|null} Engine state or null
 */
async function loadPretrainedStateAsync() {
  try {
    await access(PRETRAINED_MODEL_PATH);
  } catch {
    return null;
  }

  try {
    const data = await readFile(PRETRAINED_MODEL_PATH, 'utf8');
    console.log('Loaded pretrained model from', PRETRAINED_MODEL_PATH);
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load pretrained model:', err && err.message ? err.message : String(err));
    return null;
  }
}

// Cache pretrained state at startup
let pretrainedState = null;

class Session {
  constructor(id, engine) {
    this.id = id;
    this.engine = engine;
    this.responseGenerator = new ResponseGenerator(engine);
    this.context = new ConversationContext();  // DS-011: Conversation context
    this.created = Date.now();
    this.lastActive = Date.now();
    this.messageHistory = [];
    this.messageCount = 0;
  }

  touch() {
    this.lastActive = Date.now();
  }

  addMessage(role, content, metadata = {}) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };
    this.messageHistory.push(msg);
    this.messageCount++;
    
    // Keep last 100 messages
    if (this.messageHistory.length > 100) {
      this.messageHistory = this.messageHistory.slice(-100);
    }
    
    return msg;
  }

  getHistory(limit = 50) {
    return this.messageHistory.slice(-limit);
  }
}

class SessionManager {
  constructor(options = {}) {
    this.sessions = new Map();
    this.sessionsDir = options.sessionsDir || './data/sessions';
    this.timeout = options.timeout || 3600000; // 1 hour

    // Ensure sessions directory exists (lazy awaited by I/O methods).
    this._ensureSessionsDir = mkdir(this.sessionsDir, { recursive: true });
    
    // Cleanup interval
    this._cleanupTimer = setInterval(() => this.cleanup(), 60000);
    // Do not keep the event loop alive (important for tests).
    this._cleanupTimer.unref?.();
  }

  create(engineConfig = {}) {
    const id = this._generateId();
    
    // Start from pretrained model if available
    let engine;
    if (pretrainedState) {
      console.log(`Creating session ${id} from pretrained model`);
      engine = BSPEngine.fromJSON(pretrainedState);
      // Apply any config overrides
      if (engineConfig.rlPressure !== undefined) {
        engine.setRLPressure(engineConfig.rlPressure);
      }
    } else {
      console.log(`Creating session ${id} from scratch (no pretrained model)`);
      engine = new BSPEngine(engineConfig);
    }
    
    const session = new Session(id, engine);
    this.sessions.set(id, session);
    return session;
  }

  get(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.touch();
    }
    return session;
  }

  delete(id) {
    this.sessions.delete(id);
  }

  list() {
    return [...this.sessions.values()].map(s => ({
      id: s.id,
      created: s.created,
      lastActive: s.lastActive,
      messageCount: s.messageCount,
    }));
  }

  async save(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');

    await this._ensureSessionsDir;
    
    const filePath = path.join(this.sessionsDir, `${id}.json`);
    const data = {
      id: session.id,
      created: session.created,
      lastActive: session.lastActive,
      messageHistory: session.messageHistory,
      engine: session.engine.toJSON(),
    };

    await writeFile(filePath, JSON.stringify(data), 'utf8');
    return filePath;
  }

  async load(id) {
    const filePath = path.join(this.sessionsDir, `${id}.json`);

    await this._ensureSessionsDir;

    try {
      await access(filePath);
    } catch {
      return null;
    }

    const data = JSON.parse(await readFile(filePath, 'utf8'));
    const engine = BSPEngine.fromJSON(data.engine);
    const session = new Session(id, engine);
    session.created = data.created;
    session.messageHistory = data.messageHistory || [];
    session.messageCount = session.messageHistory.length;
    
    this.sessions.set(id, session);
    return session;
  }

  async listSaved() {
    await this._ensureSessionsDir;

    const files = await readdir(this.sessionsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const items = [];
    for (const f of jsonFiles) {
      const filePath = path.join(this.sessionsDir, f);
      const info = await stat(filePath);
      items.push({
        id: f.replace('.json', ''),
        path: filePath,
        size: info.size,
        modified: info.mtime,
      });
    }
    return items;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > this.timeout) {
        this.save(id).catch(() => {});
        this.sessions.delete(id);
      }
    }
  }

  _generateId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

class CommandHandler {
  constructor(session, sessionManager) {
    this.session = session;
    this.manager = sessionManager;
  }

  async handle(command, args) {
    switch (command) {
      case 'help':
        return this.help();
      case 'stats':
        return this.stats();
      case 'rl':
        return this.setRL(args[0]);
      case 'save':
        return await this.save(args[0]);
      case 'load':
        return await this.load(args[0]);
      case 'groups':
        return this.showGroups(parseInt(args[0]) || 10);
      case 'reset':
        return this.reset();
      case 'consolidate':
        return this.consolidate(parseInt(args[0]) || 50);
      case 'sessions':
        return this.listSessions();
      default:
        return { text: `Unknown command: ${command}. Type /help for available commands.` };
    }
  }

  help() {
    return {
      text: `
Available commands:
  /help              - Show this help
  /stats             - Show session statistics
  /rl <0-1>          - Set RL pressure (0=LM, 1=RL)
  /save [name]       - Save session state
  /load <name>       - Load session state
  /groups [n]        - Show top n groups
  /reset             - Reset conversation context
  /consolidate [n]   - Run consolidation with n episodes
  /sessions          - List saved sessions

Feedback:
  +++ or 👍          - Positive feedback
  --- or 👎          - Negative feedback
  /important         - Mark as important
      `.trim()
    };
  }

  stats() {
    const stats = this.session.engine.getStats();
    return {
      text: `
Session: ${this.session.id}
Created: ${new Date(this.session.created).toISOString()}
Messages: ${this.session.messageCount}

Engine Stats:
  Steps: ${stats.step}
  Groups: ${stats.groupCount}
  Edges: ${stats.edgeCount}
  Buffer: ${stats.bufferSize}
  RL Pressure: ${stats.rlPressure}
  Avg Surprise: ${stats.metrics.avgSurprise.toFixed(3)}
  Avg Reward: ${stats.metrics.avgReward.toFixed(3)}
      `.trim(),
      stats,
    };
  }

  setRL(value) {
    const rho = parseFloat(value);
    if (isNaN(rho) || rho < 0 || rho > 1) {
      return { text: 'Error: RL pressure must be between 0 and 1' };
    }
    this.session.engine.setRLPressure(rho);
    return { text: `RL pressure set to ${rho}` };
  }

  async save(name) {
    const id = name || this.session.id;
    const filePath = await this.manager.save(this.session.id);
    return { text: `Session saved to ${filePath}` };
  }

  async load(name) {
    if (!name) {
      return { text: 'Error: Please specify session name' };
    }
    const session = await this.manager.load(name);
    if (session) {
      return { text: `Session loaded: ${name}` };
    } else {
      return { text: `Session not found: ${name}` };
    }
  }

  showGroups(n) {
    const groups = this.session.engine.getTopGroups(n);
    const lines = groups.map((g, i) => 
      `${i + 1}. ${g.description} (usage: ${g.usageCount})`
    );
    return {
      text: `Top ${n} groups by salience:\n${lines.join('\n')}`,
      groups,
    };
  }

  reset() {
    this.session.engine.resetContext();
    return { text: 'Context reset' };
  }

  consolidate(episodes) {
    this.session.engine.consolidate(episodes);
    return { text: `Consolidated ${episodes} episodes` };
  }

  async listSessions() {
    const saved = await this.manager.listSaved();
    if (saved.length === 0) {
      return { text: 'No saved sessions' };
    }
    const lines = saved.map(s => `  ${s.id} (${Math.round(s.size/1024)}KB, ${new Date(s.modified).toLocaleDateString()})`);
    return { text: `Saved sessions:\n${lines.join('\n')}` };
  }
}

class BSPServer {
  constructor(options = {}) {
    this.port = options.port !== undefined ? options.port : 3000;
    this.host = options.host !== undefined ? options.host : 'localhost';
    this.publicDir = options.publicDir || path.join(__dirname, '../../public');
    
    this.sessionManager = new SessionManager({
      sessionsDir: options.sessionsDir,
    });
    
    this.server = null;
  }

  async start() {
    // Load pretrained model at startup
    pretrainedState = await loadPretrainedStateAsync();
    if (pretrainedState) {
      console.log(`Pretrained model loaded (${pretrainedState.store?.groups?.length || 0} groups)`);
    } else {
      console.log('No pretrained model found. Run: node scripts/pretrain.mjs');
    }
    
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error('Request error:', err);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
    });
    
    this.server.listen(this.port, this.host);
    await Promise.race([
      once(this.server, 'listening'),
      (async () => {
        const [err] = await once(this.server, 'error');
        throw err;
      })(),
    ]);

    const address = this.server.address();
    if (address && typeof address === 'object' && address.port) {
      this.port = address.port;
    }

    console.log(`BSP Server running at http://${this.host}:${this.port}`);
    console.log(`Open http://${this.host}:${this.port} in your browser to start`);
    
    return this;
  }

  async stop() {
    if (this.server) {
      this.server.close();
      await once(this.server, 'close');
    }
  }

  async handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      // API routes
      if (pathname.startsWith('/api/')) {
        await this.handleAPI(req, res, pathname, url);
        return;
      }

      // Static files
      await this.serveStatic(req, res, pathname);
    } catch (error) {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleAPI(req, res, pathname, url) {
    const parts = pathname.split('/').filter(Boolean);
    // parts: ['api', 'sessions', ...] or ['api', 'sessions', 'id', 'messages']

    // POST /api/sessions - Create session
    if (req.method === 'POST' && parts.length === 2 && parts[1] === 'sessions') {
      const session = this.sessionManager.create();
      this.sendJSON(res, { sessionId: session.id, created: session.created });
      return;
    }

    // GET /api/sessions - List sessions
    if (req.method === 'GET' && parts.length === 2 && parts[1] === 'sessions') {
      const sessions = this.sessionManager.list();
      this.sendJSON(res, { sessions });
      return;
    }

    // GET /api/sessions/saved - List saved sessions
    if (req.method === 'GET' && parts.length === 3 && parts[1] === 'sessions' && parts[2] === 'saved') {
      const saved = await this.sessionManager.listSaved();
      this.sendJSON(res, { sessions: saved });
      return;
    }

    // Routes with session ID
    if (parts.length >= 3 && parts[1] === 'sessions') {
      const sessionId = parts[2];
      let session = this.sessionManager.get(sessionId);
      
      // Try to load if not in memory
      if (!session) {
        session = await this.sessionManager.load(sessionId);
      }
      
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      // GET /api/sessions/:id
      if (req.method === 'GET' && parts.length === 3) {
        this.sendJSON(res, {
          id: session.id,
          created: session.created,
          lastActive: session.lastActive,
          messageCount: session.messageCount,
          stats: session.engine.getStats(),
        });
        return;
      }

      // POST /api/sessions/:id/messages
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'messages') {
        const body = await this.parseBody(req);
        const result = await this.processMessage(session, body);
        this.sendJSON(res, result);
        return;
      }

      // GET /api/sessions/:id/messages
      if (req.method === 'GET' && parts.length === 4 && parts[3] === 'messages') {
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const history = session.getHistory(limit);
        this.sendJSON(res, { messages: history });
        return;
      }

      // POST /api/sessions/:id/save
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'save') {
        const filePath = await this.sessionManager.save(sessionId);
        this.sendJSON(res, { saved: true, path: filePath });
        return;
      }

      // DELETE /api/sessions/:id
      if (req.method === 'DELETE' && parts.length === 3) {
        this.sessionManager.delete(sessionId);
        this.sendJSON(res, { deleted: true });
        return;
      }
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  async processMessage(session, body) {
    const { content, reward = 0, importance = null } = body;
    
    // Check for command
    const commandMatch = content.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (commandMatch) {
      const handler = new CommandHandler(session, this.sessionManager);
      const args = commandMatch[2] ? commandMatch[2].split(/\s+/) : [];
      const result = await handler.handle(commandMatch[1], args);
      
      session.addMessage('user', content);
      session.addMessage('assistant', result.text, result);
      
      return {
        response: result.text,
        isCommand: true,
        ...result,
      };
    }
    
    // Parse implicit feedback
    let effectiveReward = reward;
    if (/\+{3,}|👍|good|corect|excelent/i.test(content)) {
      effectiveReward = Math.max(effectiveReward, 0.5);
    } else if (/-{3,}|👎|bad|greșit/i.test(content)) {
      effectiveReward = Math.min(effectiveReward, -0.5);
    }
    
    // Check importance marker
    const isImportant = /important!?/i.test(content) || importance === 1;
    
    // Process through engine
    const result = session.engine.process(content, {
      reward: effectiveReward,
      importanceOverride: isImportant ? 1.0 : null,
    });
    
    // Update conversation context (DS-011)
    const wordTokens = result.wordTokens || session.engine.tokenizer.tokenizeWords(content);
    session.context.addTurn(wordTokens, result.activeGroups, {
      importance: result.importance
    });
    
    // Generate response with context
    const response = this.generateResponse(session, result, content, effectiveReward);
    
    // Store messages
    session.addMessage('user', content, { reward: effectiveReward, important: isImportant });
    session.addMessage('assistant', response.text, { 
      activeGroups: result.activeGroupIds,
      surprise: result.surprise,
    });
    
    return {
      response: response.text,
      activeGroups: result.activeGroupIds,
      surprise: result.surprise,
      hallucination: result.hallucination,
      inputSize: result.inputSize,
      importance: result.importance,
      predictions: result.predictions,
      groupDescriptions: result.activeGroups.map(g => session.engine.describeGroup(g.id)),
      contextStats: session.context.getStats(),  // Include context info
    };
  }

  generateResponse(session, result, input, reward = 0) {
    // Use the natural language response generator with conversation context
    return session.responseGenerator.generate(result, {
      input: input,
      reward: reward,
    }, session.context);  // Pass conversation context (DS-011)
  }

  async serveStatic(req, res, pathname) {
    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }
    
    const filePath = path.join(this.publicDir, pathname);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(this.publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    
    // Check if file exists
    try {
      await access(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    
    // Get content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  }

  sendJSON(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  async parseBody(req) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    if (!body) return {};
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('Invalid JSON');
    }
  }
}

export { BSPServer, SessionManager, Session };
