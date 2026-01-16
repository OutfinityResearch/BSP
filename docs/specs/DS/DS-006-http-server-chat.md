# DS-006: HTTP Server and Chat Interface

**Version**: 1.1  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

This document describes the HTTP server that exposes BSP as an interactive chat service, with support for sessions, implicit RL, and in-conversation control.

---

## 2. Pre-trained Model (IMPORTANT)

### 2.1 Principle

**New sessions do NOT start from zero.** Instead:

1. The system has a **pretrained model** learned from a base corpus
2. Each new session starts from this model
3. Continuous learning adds session-specific knowledge
4. Sessions can be saved and resumed

### 2.2 Pre-training

```bash
# Download data and pretrain the model
node scripts/pretrain.mjs
```

This creates `data/pretrained.json` containing:
- Groups learned from the corpus
- Deductions between groups
- Vocabulary (if `useVocab=true`)

### 2.3 Server Startup Flow

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

### 2.4 Session Creation Flow

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

The system generates **natural language** responses, not only technical metrics:

```javascript
// Input: "Tell me about cats"
// Output: "I see you're talking about cats and animals. 
//          This might relate to pets or wildlife."

// NOT: "Surprise: 5, Importance: 0.3"
```

### 3.2 Response Types

| Type | Trigger | Example |
|-----|---------|---------|
| Greeting | "Hello", "Hi" | "Hello! I'm learning from our conversation..." |
| Understanding | Active groups | "I see you're talking about X and Y..." |
| High Surprise | Surprise > 70% | "This is new to me! I'm learning..." |
| Low Confidence | No groups | "I don't have patterns for this yet..." |
| Feedback | +++ / --- | "Thanks for the feedback!" |

### 3.3 Response Structure

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

## 4. Server Architecture

### 4.1 Technology Stack

- **Runtime**: Node.js (v18+)
- **HTTP**: `node:http` (no external framework)
- **Format**: JSON

### 4.2 Structure

```
┌────────────────────────────────────────────────────────────────┐
│                      HTTP Server                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────────────┐                    │
│  │ REST API     │  │ Static Files        │                    │
│  │ /api/*       │  │ /chat (HTML UI)     │                    │
│  └──────┬───────┘  └──────────────────────┘                    │
│         │                                                      │
│         ▼                                                      │
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
  → Create a new session
  Body: { "name"?: string, "loadFrom"?: string }
  Response: { "sessionId": string, "created": timestamp }

GET /api/sessions/:id
  → Session info
  Response: { "id", "created", "lastActive", "messageCount", "stats" }

DELETE /api/sessions/:id
  → Close and optionally save the session

GET /api/sessions
  → List active sessions
  Response: { "sessions": [...] }
```

### 5.2 Chat

```
POST /api/sessions/:id/messages
  → Send a message
  Body: {
    "content": string,
    "reward"?: number,        // Reward explicit (-1 to 1)
    "importance"?: number,    // Override importance
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
  → Conversation history
  Query: ?limit=50&offset=0
  Response: { "messages": [...], "total": number }
```

### 5.3 Control

```
POST /api/sessions/:id/control
  → Control commands
  Body: {
    "command": "set-rl-pressure" | "consolidate" | "reset-context" | ...,
    "params": {...}
  }

GET /api/sessions/:id/stats
  → Session statistics
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
  → Save state
  Body: { "path"?: string, "format"?: "json" }
  Response: { "path": string, "size": number }

POST /api/sessions/:id/load
  → Load state
  Body: { "path": string }
  Response: { "loaded": true, "stats": {...} }

GET /api/snapshots
  → List available snapshots
```

---

## 6. Transport

All interaction uses the HTTP endpoints described in Section 5.

---

## 7. Server Implementation

### 7.1 Main Server

```typescript
import { createServer } from 'node:http';
import { SessionManager } from './SessionManager.mjs';
import { Router } from './Router.mjs';

const PORT = process.env.PORT || 3000;

// Session manager
const sessions = new SessionManager();

// HTTP Server
const server = createServer(async (req, res) => {
  const router = new Router(sessions);
  await router.handle(req, res);
});

server.listen(PORT, () => {
  console.log(`BSP Server running on http://localhost:${PORT}`);
});
```

### 7.2 Session Class

```typescript
type ChatRequest = {
  content: string;
  reward?: number;
  importance?: number;
  metadata?: object;
};

type ChatResponse = {
  response: string;
  activeGroups: number[];
  surprise: number;
  confidence: number;
  reasoning?: string[];
};

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
  
  async chat(payload: ChatRequest): Promise<ChatResponse> {
    this.lastActive = Date.now();
    const { content, reward, importance } = payload;
    
    // Parse for special commands
    const command = this.parseCommand(content);
    if (command) {
      return this.executeCommand(command);
    }
    
    // Normal processing
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
    
    // Generate response
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
      response: response.text,
      activeGroups: result.activeGroups.map(g => g.id),
      surprise: result.surprise,
      confidence: response.confidence,
      reasoning: response.reasoning,
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
    // Use group prediction to generate a response
    const predictedGroups = this.engine.predictNext(this.context);
    
    // In the MVP: return a summary of active groups
    // In an advanced version: integrate with a text generator
    
    const groupLabels = predictedGroups
      .slice(0, 5)
      .map(g => this.engine.describeGroup(g.groupId));
    
    return {
      text: `Predicted concepts: ${groupLabels.join(', ')}`,
      confidence: predictedGroups[0]?.score || 0,
      reasoning: groupLabels,
    };
  }
  
  // Save/load
  async save(path?: string): Promise<string> {
    const savePath = path || `./sessions/${this.id}.bsp`;
    await this.engine.save(savePath);
    return savePath;
  }
  
  async load(path: string): Promise<void> {
    await this.engine.load(path);
  }
}
```

---

## 8. Chat Commands

### 8.1 Supported Commands

| Command | Description | Example |
|---------|-----------|---------|
| `/help` | Show available commands | `/help` |
| `/stats` | Session statistics | `/stats` |
| `/rl <value>` | Set RL pressure | `/rl 0.5` |
| `/save [path]` | Save state | `/save mysession` |
| `/load <path>` | Load state | `/load mysession` |
| `/groups [n]` | Show top groups | `/groups 10` |
| `/explain <id>` | Explain a group | `/explain 42` |
| `/consolidate [n]` | Run consolidation | `/consolidate 100` |
| `/reset` | Reset context | `/reset` |
| `/debug` | Toggle debug mode | `/debug on` |

### 8.2 Command Implementation

```typescript
class CommandHandler {
  private session: Session;
  
  async handle(command: Command): Promise<ChatResponse> {
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
  
  private help(): ChatResponse {
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
  
  private stats(): ChatResponse {
    const stats = this.session.engine.getStats();
    return this.message(formatStats(stats));
  }
}
```

---

## 9. UI HTML (Reference)

### 9.1 File Structure

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

## 10. Configuration

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
    format: 'json';
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

## 12. Interaction Diagram

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Client  │                    │  Server  │                    │  Engine  │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │ POST /api/sessions            │                               │
     │──────────────────────────────▶│                               │
     │ {sessionId}                    │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
     │ POST /api/sessions/:id/messages│                              │
     │ {content:'...'}               │                               │
     │──────────────────────────────▶│                               │
     │                               │ process(content, context)     │
     │                               │──────────────────────────────▶│
     │                               │                               │
     │                               │ {activeGroups, surprise, ...} │
     │                               │◀──────────────────────────────│
     │                               │                               │
     │ {response:'...'}              │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
     │ POST /api/sessions/:id/messages│                              │
     │ {content:'+++', reward:1}     │                               │
     │──────────────────────────────▶│                               │
     │                               │ updateWithReward(1)           │
     │                               │──────────────────────────────▶│
     │                               │                               │
```
