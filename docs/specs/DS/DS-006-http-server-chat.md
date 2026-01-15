# DS-006: HTTP Server and Chat Interface

**Version**: 1.1  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

Acest document descrie serverul HTTP care expune BSP ca un serviciu de chat interactiv, cu suport pentru sesiuni, RL implicit, și control din conversație.

---

## 2. Pre-trained Model (IMPORTANT)

### 2.1 Principiu

**Sesiunile noi NU pornesc de la zero.** În schimb:

1. Sistemul are un **model pre-antrenat** pe un corpus de bază
2. Fiecare sesiune nouă pornește de la acest model
3. Învățarea continuă adaugă cunoștințe specifice sesiunii
4. Sesiunile pot fi salvate și reluate

### 2.2 Pre-antrenare

```bash
# Descarcă date și pre-antrenează modelul
node scripts/pretrain.js
```

Aceasta creează `data/pretrained.json` care conține:
- Grupuri învățate din corpus
- Deducții între grupuri
- Vocabular (dacă useVocab=true)

### 2.3 Flow la Pornire Server

```
Server Start
    │
    ▼
┌─────────────────────────┐
│ Load pretrained.json    │
│ (if exists)             │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Cache in memory         │
└───────────┬─────────────┘
            │
            ▼
    Ready for sessions
```

### 2.4 Flow la Creare Sesiune

```
POST /api/sessions
    │
    ▼
┌─────────────────────────┐
│ Pretrained model exists?│
└───────────┬─────────────┘
            │
     Yes ◄──┴──► No
      │          │
      ▼          ▼
┌──────────┐ ┌──────────┐
│ Clone    │ │ Create   │
│ pretrained│ │ fresh    │
│ state    │ │ engine   │
└──────────┘ └──────────┘
      │          │
      └────┬─────┘
           ▼
    Session ready
    (with knowledge!)
```

---

## 3. Natural Language Responses

### 3.1 ResponseGenerator

Sistemul generează răspunsuri în **limbaj natural**, nu doar metrici tehnice:

```javascript
// Input: "Tell me about cats"
// Output: "I see you're talking about cats and animals. 
//          This might relate to pets or wildlife."

// NOT: "Surprise: 5, Importance: 0.3"
```

### 3.2 Tipuri de Răspunsuri

| Tip | Trigger | Exemplu |
|-----|---------|---------|
| Greeting | "Hello", "Hi" | "Hello! I'm learning from our conversation..." |
| Understanding | Grupuri active | "I see you're talking about X and Y..." |
| High Surprise | Surprise > 70% | "This is new to me! I'm learning..." |
| Low Confidence | No groups | "I don't have patterns for this yet..." |
| Feedback | +++ / --- | "Thanks for the feedback!" |

### 3.3 Structura Răspuns

```javascript
{
  text: "Natural language response...",
  type: "understanding",
  confidence: 0.85,
  concepts: ["cat", "animal", "pet"],
  predictions: ["dog", "food"]
}
```

---

## 4. Arhitectura Server

### 4.1 Stack Tehnologic

- **Runtime**: Node.js (v18+)
- **Framework**: Native HTTP sau Fastify (lightweight)
- **WebSocket**: Pentru streaming și real-time
- **Format**: JSON pentru API, SSE pentru streaming

### 4.2 Structura

```
┌────────────────────────────────────────────────────────────────┐
│                      HTTP Server                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ REST API     │  │ WebSocket    │  │ Static Files        │  │
│  │ /api/*       │  │ /ws          │  │ /chat (HTML UI)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                    │
│         └────────┬────────┘                                    │
│                  │                                             │
│         ┌────────▼────────┐                                    │
│         │ Session Manager │                                    │
│         └────────┬────────┘                                    │
│                  │                                             │
│         ┌────────▼────────┐                                    │
│         │ BSP Engine     │                                    │
│         │ (per session)   │                                    │
│         └─────────────────┘                                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. API Endpoints

### 5.1 Session Management

```
POST /api/sessions
  → Creează sesiune nouă
  Body: { "name"?: string, "loadFrom"?: string }
  Response: { "sessionId": string, "created": timestamp }

GET /api/sessions/:id
  → Info despre sesiune
  Response: { "id", "created", "lastActive", "messageCount", "stats" }

DELETE /api/sessions/:id
  → Închide și opțional salvează sesiunea

GET /api/sessions
  → Listează sesiunile active
  Response: { "sessions": [...] }
```

### 5.2 Chat

```
POST /api/sessions/:id/messages
  → Trimite mesaj
  Body: {
    "content": string,
    "reward"?: number,        // Reward explicit (-1 to 1)
    "importance"?: number,    // Override importanță
    "metadata"?: object
  }
  Response: {
    "response": string,
    "activeGroups": number[],
    "surprise": number,
    "confidence": number,
    "reasoning"?: string[]
  }

GET /api/sessions/:id/messages
  → Istoric conversație
  Query: ?limit=50&offset=0
  Response: { "messages": [...], "total": number }
```

### 5.3 Control

```
POST /api/sessions/:id/control
  → Comenzi de control
  Body: {
    "command": "set-rl-pressure" | "consolidate" | "reset-context" | ...,
    "params": {...}
  }

GET /api/sessions/:id/stats
  → Statistici sesiune
  Response: {
    "groupCount": number,
    "deductionCount": number,
    "avgSurprise": number,
    "avgReward": number,
    "rlPressure": number,
    ...
  }
```

### 5.4 Persistence

```
POST /api/sessions/:id/save
  → Salvează starea
  Body: { "path"?: string, "format"?: "msgpack" | "json" }
  Response: { "path": string, "size": number }

POST /api/sessions/:id/load
  → Încarcă stare
  Body: { "path": string }
  Response: { "loaded": true, "stats": {...} }

GET /api/snapshots
  → Listează snapshot-uri disponibile
```

---

## 6. WebSocket Protocol

### 6.1 Connection

```javascript
// Client
const ws = new WebSocket('ws://localhost:3000/ws?session=SESSION_ID');

// Sau creează sesiune nouă
const ws = new WebSocket('ws://localhost:3000/ws?new=true');
```

### 6.2 Message Format

```typescript
interface WSMessage {
  type: 'chat' | 'control' | 'feedback' | 'stream' | 'error' | 'status';
  payload: any;
  timestamp: number;
  id?: string;  // Pentru corelare request-response
}
```

### 6.3 Chat Messages

```typescript
// Client → Server
{
  type: 'chat',
  payload: {
    content: "Hello, what can you help me with?",
    reward?: 0.5,
    stream?: true  // Streaming response
  }
}

// Server → Client (non-streaming)
{
  type: 'chat',
  payload: {
    response: "I can help with...",
    activeGroups: [12, 45, 78],
    surprise: 0.23,
    confidence: 0.87
  }
}

// Server → Client (streaming)
{
  type: 'stream',
  payload: {
    chunk: "I can",
    done: false
  }
}
{
  type: 'stream',
  payload: {
    chunk: " help with...",
    done: true,
    stats: { surprise: 0.23, confidence: 0.87 }
  }
}
```

### 6.4 Feedback Messages

```typescript
// Quick feedback
{
  type: 'feedback',
  payload: {
    messageId: 'msg_123',
    rating: 1  // -1, 0, 1
  }
}

// Detailed feedback
{
  type: 'feedback',
  payload: {
    messageId: 'msg_123',
    reward: 0.8,
    comment: "Very helpful!",
    important: true
  }
}
```

### 6.5 Control Messages

```typescript
// Set RL pressure
{
  type: 'control',
  payload: {
    command: 'set-rl-pressure',
    value: 0.5
  }
}

// Request consolidation
{
  type: 'control',
  payload: {
    command: 'consolidate',
    episodes: 100
  }
}

// Get stats
{
  type: 'control',
  payload: {
    command: 'get-stats'
  }
}
```

---

## 7. Implementare Server

### 7.1 Main Server

```typescript
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SessionManager } from './SessionManager';
import { Router } from './Router';

const PORT = process.env.PORT || 3000;

// Session manager
const sessions = new SessionManager();

// HTTP Server
const server = createServer(async (req, res) => {
  const router = new Router(sessions);
  await router.handle(req, res);
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://localhost`);
  const sessionId = url.searchParams.get('session');
  const createNew = url.searchParams.get('new') === 'true';
  
  if (createNew) {
    const session = sessions.create();
    ws.send(JSON.stringify({
      type: 'status',
      payload: { sessionId: session.id, status: 'connected' }
    }));
    handleWebSocket(ws, session);
  } else if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      handleWebSocket(ws, session);
    } else {
      ws.close(4004, 'Session not found');
    }
  } else {
    ws.close(4000, 'Session ID required');
  }
});

function handleWebSocket(ws: WebSocket, session: Session) {
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as WSMessage;
      const response = await session.handleMessage(msg);
      ws.send(JSON.stringify(response));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: error.message }
      }));
    }
  });
  
  ws.on('close', () => {
    session.onDisconnect();
  });
}

server.listen(PORT, () => {
  console.log(`BSP Server running on http://localhost:${PORT}`);
});
```

### 7.2 Session Class

```typescript
class Session {
  readonly id: string;
  private engine: BSPEngine;
  private context: Group[] = [];
  private messageHistory: Message[] = [];
  private created: number;
  private lastActive: number;
  
  constructor(id: string, config?: SessionConfig) {
    this.id = id;
    this.engine = new BSPEngine(config?.engineConfig);
    this.created = Date.now();
    this.lastActive = Date.now();
    
    if (config?.loadFrom) {
      this.engine.load(config.loadFrom);
    }
  }
  
  async handleMessage(msg: WSMessage): Promise<WSMessage> {
    this.lastActive = Date.now();
    
    switch (msg.type) {
      case 'chat':
        return this.handleChat(msg.payload);
      case 'feedback':
        return this.handleFeedback(msg.payload);
      case 'control':
        return this.handleControl(msg.payload);
      default:
        throw new Error(`Unknown message type: ${msg.type}`);
    }
  }
  
  private async handleChat(payload: ChatPayload): Promise<WSMessage> {
    const { content, reward, importance } = payload;
    
    // Parse pentru comenzi speciale
    const command = this.parseCommand(content);
    if (command) {
      return this.executeCommand(command);
    }
    
    // Procesare normală
    const result = await this.engine.process(content, {
      context: this.context,
      reward,
      importanceOverride: importance,
    });
    
    // Update context
    this.context = result.activeGroups;
    
    // Store in history
    this.messageHistory.push({
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    
    // Generează răspuns
    const response = await this.generateResponse(result);
    
    this.messageHistory.push({
      id: generateId(),
      role: 'assistant',
      content: response.text,
      timestamp: Date.now(),
      metadata: {
        activeGroups: result.activeGroups.map(g => g.id),
        surprise: result.surprise,
      }
    });
    
    return {
      type: 'chat',
      payload: {
        response: response.text,
        activeGroups: result.activeGroups.map(g => g.id),
        surprise: result.surprise,
        confidence: response.confidence,
        reasoning: response.reasoning,
      },
      timestamp: Date.now(),
    };
  }
  
  private parseCommand(content: string): Command | null {
    const match = content.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (!match) return null;
    
    return {
      name: match[1],
      args: match[2]?.split(/\s+/) || [],
    };
  }
  
  private async generateResponse(result: ProcessResult): Promise<{
    text: string;
    confidence: number;
    reasoning?: string[];
  }> {
    // Folosește predicția de grupuri pentru a genera răspuns
    const predictedGroups = this.engine.predictNext(this.context);
    
    // În MVP: returnează un rezumat al grupurilor active
    // În versiunea avansată: integrare cu un generator de text
    
    const groupLabels = predictedGroups
      .slice(0, 5)
      .map(g => this.engine.describeGroup(g.groupId));
    
    return {
      text: `Predicted concepts: ${groupLabels.join(', ')}`,
      confidence: predictedGroups[0]?.score || 0,
      reasoning: groupLabels,
    };
  }
  
  // Salvare/încărcare
  async save(path?: string): Promise<string> {
    const savePath = path || `./sessions/${this.id}.bpcm`;
    await this.engine.save(savePath);
    return savePath;
  }
  
  async load(path: string): Promise<void> {
    await this.engine.load(path);
  }
}
```

---

## 8. Comenzi din Chat

### 8.1 Comenzi Suportate

| Comandă | Descriere | Exemplu |
|---------|-----------|---------|
| `/help` | Afișează comenzile disponibile | `/help` |
| `/stats` | Statistici sesiune | `/stats` |
| `/rl <value>` | Setează RL pressure | `/rl 0.5` |
| `/save [path]` | Salvează starea | `/save mysession` |
| `/load <path>` | Încarcă stare | `/load mysession` |
| `/groups [n]` | Afișează top grupuri | `/groups 10` |
| `/explain <id>` | Explică un grup | `/explain 42` |
| `/consolidate [n]` | Rulează consolidare | `/consolidate 100` |
| `/reset` | Resetează contextul | `/reset` |
| `/debug` | Toggle mod debug | `/debug on` |

### 8.2 Implementare Comenzi

```typescript
class CommandHandler {
  private session: Session;
  
  async handle(command: Command): Promise<WSMessage> {
    switch (command.name) {
      case 'help':
        return this.help();
      
      case 'stats':
        return this.stats();
      
      case 'rl':
        const value = parseFloat(command.args[0]);
        this.session.engine.setRLPressure(value);
        return this.message(`RL pressure set to ${value}`);
      
      case 'save':
        const savePath = await this.session.save(command.args[0]);
        return this.message(`Session saved to ${savePath}`);
      
      case 'load':
        await this.session.load(command.args[0]);
        return this.message(`Session loaded from ${command.args[0]}`);
      
      case 'groups':
        const n = parseInt(command.args[0]) || 10;
        const groups = this.session.engine.getTopGroups(n);
        return this.groupList(groups);
      
      case 'explain':
        const groupId = parseInt(command.args[0]);
        const explanation = this.session.engine.explainGroup(groupId);
        return this.message(explanation);
      
      case 'consolidate':
        const episodes = parseInt(command.args[0]) || 50;
        await this.session.engine.consolidate(episodes);
        return this.message(`Consolidated ${episodes} episodes`);
      
      case 'reset':
        this.session.resetContext();
        return this.message('Context reset');
      
      default:
        return this.message(`Unknown command: ${command.name}`);
    }
  }
  
  private help(): WSMessage {
    const helpText = `
Available commands:
  /help           - Show this help
  /stats          - Show session statistics
  /rl <0-1>       - Set RL pressure
  /save [name]    - Save session state
  /load <name>    - Load session state
  /groups [n]     - Show top n groups
  /explain <id>   - Explain a group
  /consolidate [n]- Run consolidation
  /reset          - Reset conversation context
  /debug on|off   - Toggle debug mode
    `.trim();
    
    return this.message(helpText);
  }
  
  private stats(): WSMessage {
    const stats = this.session.engine.getStats();
    return {
      type: 'chat',
      payload: {
        response: formatStats(stats),
        stats,
      },
      timestamp: Date.now(),
    };
  }
}
```

---

## 9. UI HTML (Optional)

### 9.1 Structura Fișiere

```
public/
├── index.html      # Main chat UI
├── chat.js         # Client logic
└── styles.css      # Styling
```

### 9.2 Minimal Chat UI

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BSP Chat</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>BSP Chat</h1>
      <div id="session-info"></div>
    </header>
    
    <main id="chat-container">
      <div id="messages"></div>
    </main>
    
    <footer>
      <form id="chat-form">
        <input type="text" id="input" placeholder="Type a message..." autocomplete="off">
        <button type="submit">Send</button>
      </form>
      <div id="feedback-buttons">
        <button data-rating="1">👍</button>
        <button data-rating="-1">👎</button>
      </div>
    </footer>
    
    <aside id="stats-panel">
      <h3>Session Stats</h3>
      <pre id="stats"></pre>
    </aside>
  </div>
  
  <script src="chat.js"></script>
</body>
</html>
```

---

## 10. Configurare

### 10.1 Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0

# Sessions
SESSION_TIMEOUT_MS=3600000  # 1 hour
MAX_SESSIONS=100
AUTO_SAVE_INTERVAL_MS=300000  # 5 minutes

# Engine defaults
DEFAULT_RL_PRESSURE=0.3
MAX_CONTEXT_GROUPS=32

# Persistence
SESSIONS_DIR=./data/sessions
SNAPSHOTS_DIR=./data/snapshots
```

### 10.2 Config Object

```typescript
interface ServerConfig {
  port: number;
  host: string;
  
  session: {
    timeout: number;
    maxSessions: number;
    autoSaveInterval: number;
  };
  
  engine: {
    defaultRLPressure: number;
    maxContextGroups: number;
    // ... from DS-001
  };
  
  persistence: {
    sessionsDir: string;
    snapshotsDir: string;
    format: 'msgpack' | 'json';
  };
}
```

---

## 11. Security Considerations

### 11.1 Basic Security

```typescript
// Rate limiting
const rateLimit = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimit.get(ip) || [];
  
  // Remove old requests
  const recent = requests.filter(t => now - t < 60000);
  
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  recent.push(now);
  rateLimit.set(ip, recent);
  return true;
}

// Input sanitization
function sanitizeInput(input: string): string {
  return input
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/[\x00-\x1f]/g, '');  // Remove control chars
}
```

### 11.2 Session Security

```typescript
// Session token generation
function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Session validation
function validateSession(sessionId: string): boolean {
  return /^[a-f0-9]{64}$/.test(sessionId);
}
```

---

## 12. Diagrama Interacțiune

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Client  │                    │  Server  │                    │  Engine  │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │ WS Connect (?session=X)       │                               │
     │──────────────────────────────▶│                               │
     │                               │                               │
     │ {type:'status', connected}    │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
     │ {type:'chat', content:'...'}  │                               │
     │──────────────────────────────▶│                               │
     │                               │ process(content, context)     │
     │                               │──────────────────────────────▶│
     │                               │                               │
     │                               │ {activeGroups, surprise, ...} │
     │                               │◀──────────────────────────────│
     │                               │                               │
     │ {type:'chat', response:'...'} │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
     │ {type:'feedback', rating:1}   │                               │
     │──────────────────────────────▶│                               │
     │                               │ updateWithReward(1)           │
     │                               │──────────────────────────────▶│
     │                               │                               │
```
