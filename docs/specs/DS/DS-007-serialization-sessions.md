# DS-007: Serialization and Session Management

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Overview

Acest document descrie mecanismele de serializare pentru starea BSP și managementul sesiunilor pentru continuitate și persistență.

---

## 2. Cerințe

### 2.1 Funcționale

1. **Save/Load rapid**: Încărcare în < 1s pentru sesiuni normale
2. **Incremental save**: Posibilitate de save diferențial
3. **Continuitate sesiuni**: Reluare conversație din punctul exact
4. **Snapshots**: Multiple puncte de restaurare
5. **Export/Import**: Format portabil între instanțe

### 2.2 Non-funcționale

1. **Compactitate**: Minimizare spațiu pe disc
2. **Compatibilitate**: Versioning pentru migrări
3. **Integritate**: Detectare corupție
4. **Security**: Opțional criptare

---

## 3. Structura Serializată

### 3.1 Top-Level Format

```typescript
interface SerializedBSPState {
  // Header
  magic: string;              // "BSP"
  version: string;            // "1.0.0"
  timestamp: number;
  checksum: string;
  
  // Configuration
  config: SerializedConfig;
  
  // Core state
  groups: SerializedGroups;
  deductions: SerializedDeductions;
  
  // Indexes (optional, can be rebuilt)
  indexes?: SerializedIndexes;
  
  // Learning state
  learningState: SerializedLearningState;
  
  // Session state
  session?: SerializedSessionState;
  
  // Replay buffer (optional)
  replayBuffer?: SerializedReplayBuffer;
}
```

### 3.2 Serialized Groups

```typescript
interface SerializedGroups {
  count: number;
  nextId: number;
  
  // Compact storage
  groups: SerializedGroup[];
}

interface SerializedGroup {
  id: number;
  
  // Members as compressed bitmap
  members: string;  // Base64 encoded Roaring bitmap
  
  // Counts - doar pentru membri activi (sparse)
  counts: [number, number][];  // [id, count][]
  
  // Metadata
  salience: number;
  age: number;
  usageCount: number;
  lastUsed: number;
  
  // Deducții outgoing (duplicate pentru fast access)
  deduce?: string;  // Base64 Roaring
}
```

### 3.3 Serialized Deductions

```typescript
interface SerializedDeductions {
  linkCount: number;
  
  // Edges: from → to → weight
  edges: SerializedEdge[];
  
  // Optional: metadata per edge
  metadata?: Map<string, EdgeMetadata>;
}

interface SerializedEdge {
  from: number;
  to: number;
  weight: number;
}
```

### 3.4 Serialized Session State

```typescript
interface SerializedSessionState {
  sessionId: string;
  created: number;
  lastActive: number;
  
  // Current context
  contextGroupIds: number[];
  
  // Conversation history (optional, can be truncated)
  messageHistory?: SerializedMessage[];
  
  // RL state
  rlPressure: number;
  recentRewards: number[];
}

interface SerializedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    activeGroups?: number[];
    surprise?: number;
    reward?: number;
  };
}
```

---

## 4. Formatul de Fișier

### 4.1 Binary Format (MessagePack)

Preferabil pentru performanță și compactitate.

```typescript
import * as msgpack from 'msgpack-lite';
import * as zlib from 'zlib';

class BSPSerializer {
  // Serializare
  async serialize(state: BSPState): Promise<Buffer> {
    // Convert la format serializabil
    const serializable = this.toSerializable(state);
    
    // Encode cu msgpack
    const packed = msgpack.encode(serializable);
    
    // Compress cu gzip
    const compressed = await this.compress(packed);
    
    // Add header
    return this.addHeader(compressed);
  }
  
  // Deserializare
  async deserialize(buffer: Buffer): Promise<BSPState> {
    // Verify și strip header
    const data = this.verifyAndStripHeader(buffer);
    
    // Decompress
    const packed = await this.decompress(data);
    
    // Decode
    const serializable = msgpack.decode(packed);
    
    // Convert la state
    return this.fromSerializable(serializable);
  }
  
  private addHeader(data: Buffer): Buffer {
    const header = Buffer.alloc(16);
    header.write('BSP', 0);           // Magic bytes
    header.writeUInt8(1, 4);           // Major version
    header.writeUInt8(0, 5);           // Minor version
    header.writeUInt16LE(0, 6);        // Flags
    header.writeBigUInt64LE(BigInt(data.length), 8);  // Data length
    
    return Buffer.concat([header, data]);
  }
  
  private verifyAndStripHeader(buffer: Buffer): Buffer {
    if (buffer.toString('utf8', 0, 4) !== 'BSP') {
      throw new Error('Invalid BSP file');
    }
    
    const version = `${buffer.readUInt8(4)}.${buffer.readUInt8(5)}`;
    if (!this.isVersionCompatible(version)) {
      throw new Error(`Incompatible version: ${version}`);
    }
    
    return buffer.slice(16);
  }
  
  private async compress(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
  
  private async decompress(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
}
```

### 4.2 JSON Format (Human-readable)

Pentru debugging și interoperabilitate.

```typescript
class JSONSerializer {
  async serialize(state: BSPState): Promise<string> {
    const serializable = this.toSerializable(state);
    return JSON.stringify(serializable, null, 2);
  }
  
  async deserialize(json: string): Promise<BSPState> {
    const parsed = JSON.parse(json);
    return this.fromSerializable(parsed);
  }
  
  private toSerializable(state: BSPState): SerializedBSPState {
    return {
      magic: 'BSP',
      version: '1.0.0',
      timestamp: Date.now(),
      checksum: this.computeChecksum(state),
      
      config: state.config,
      
      groups: {
        count: state.store.size,
        nextId: state.store.nextId,
        groups: Array.from(state.store.getAll()).map(g => ({
          id: g.id,
          members: g.members.serialize().toString('base64'),
          counts: Array.from(g.memberCounts.entries()),
          salience: g.salience,
          age: g.age,
          usageCount: g.usageCount,
          lastUsed: g.lastUsed,
        })),
      },
      
      deductions: this.serializeDeductions(state.graph),
      
      learningState: {
        step: state.step,
        recentPatterns: this.serializePatterns(state.patternTracker),
      },
      
      session: state.session ? this.serializeSession(state.session) : undefined,
    };
  }
}
```

---

## 5. Session Manager

### 5.1 Structura

```typescript
class SessionManager {
  private sessions: Map<string, Session>;
  private config: SessionConfig;
  private serializer: BSPSerializer;
  
  constructor(config: SessionConfig) {
    this.sessions = new Map();
    this.config = config;
    this.serializer = new BSPSerializer();
    
    // Auto-cleanup expired sessions
    setInterval(() => this.cleanup(), 60000);
    
    // Auto-save interval
    if (config.autoSaveInterval) {
      setInterval(() => this.autoSave(), config.autoSaveInterval);
    }
  }
  
  // Create new session
  create(options?: CreateSessionOptions): Session {
    const id = generateSessionId();
    const session = new Session(id, {
      engineConfig: this.config.defaultEngineConfig,
      ...options,
    });
    
    this.sessions.set(id, session);
    return session;
  }
  
  // Get existing session
  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.touch();
    }
    return session;
  }
  
  // Resume session from disk
  async resume(id: string): Promise<Session | null> {
    const path = this.getSessionPath(id);
    
    if (!await this.fileExists(path)) {
      return null;
    }
    
    try {
      const buffer = await fs.readFile(path);
      const state = await this.serializer.deserialize(buffer);
      
      const session = new Session(id, {
        preloadedState: state,
      });
      
      this.sessions.set(id, session);
      return session;
    } catch (error) {
      console.error(`Failed to resume session ${id}:`, error);
      return null;
    }
  }
  
  // Save session to disk
  async save(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    
    const state = session.getState();
    const buffer = await this.serializer.serialize(state);
    const filePath = this.getSessionPath(id);
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }
  
  // Close and optionally save session
  async close(id: string, options?: CloseOptions): Promise<void> {
    if (options?.save !== false) {
      await this.save(id);
    }
    
    this.sessions.delete(id);
  }
  
  // List active sessions
  list(): SessionInfo[] {
    return Array.from(this.sessions.entries()).map(([id, session]) => ({
      id,
      created: session.created,
      lastActive: session.lastActive,
      messageCount: session.messageCount,
    }));
  }
  
  // List saved sessions
  async listSaved(): Promise<SavedSessionInfo[]> {
    const dir = this.config.sessionsDir;
    const files = await fs.readdir(dir);
    
    return Promise.all(
      files
        .filter(f => f.endsWith('.bpcm'))
        .map(async f => {
          const path = `${dir}/${f}`;
          const stat = await fs.stat(path);
          return {
            id: f.replace('.bpcm', ''),
            path,
            size: stat.size,
            modified: stat.mtime,
          };
        })
    );
  }
  
  // Cleanup expired sessions
  private cleanup(): void {
    const now = Date.now();
    
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > this.config.timeout) {
        this.close(id, { save: true });
      }
    }
  }
  
  // Auto-save all sessions
  private async autoSave(): Promise<void> {
    for (const id of this.sessions.keys()) {
      try {
        await this.save(id);
      } catch (error) {
        console.error(`Auto-save failed for ${id}:`, error);
      }
    }
  }
  
  private getSessionPath(id: string): string {
    return `${this.config.sessionsDir}/${id}.bpcm`;
  }
}
```

---

## 6. Incremental Save (Deltas)

### 6.1 Delta Format

```typescript
interface DeltaState {
  baseVersion: string;  // Reference to base snapshot
  timestamp: number;
  
  // Changed groups
  groupsAdded: SerializedGroup[];
  groupsModified: GroupDelta[];
  groupsDeleted: number[];
  
  // Changed deductions
  deductionsAdded: SerializedEdge[];
  deductionsModified: SerializedEdge[];
  deductionsDeleted: [number, number][];  // [from, to][]
  
  // New replay episodes
  newEpisodes?: SerializedEpisode[];
}

interface GroupDelta {
  id: number;
  
  // Only changed fields
  membersAdded?: number[];
  membersRemoved?: number[];
  countsChanged?: [number, number][];
  salienceNew?: number;
}
```

### 6.2 Delta Writer

```typescript
class DeltaWriter {
  private baseState: SerializedBSPState | null = null;
  private baseVersion: string | null = null;
  
  setBase(state: SerializedBSPState, version: string): void {
    this.baseState = state;
    this.baseVersion = version;
  }
  
  computeDelta(currentState: BSPState): DeltaState {
    if (!this.baseState || !this.baseVersion) {
      throw new Error('No base state set');
    }
    
    const delta: DeltaState = {
      baseVersion: this.baseVersion,
      timestamp: Date.now(),
      groupsAdded: [],
      groupsModified: [],
      groupsDeleted: [],
      deductionsAdded: [],
      deductionsModified: [],
      deductionsDeleted: [],
    };
    
    // Find group changes
    const baseGroupIds = new Set(this.baseState.groups.groups.map(g => g.id));
    const currentGroupIds = new Set(
      Array.from(currentState.store.getAll()).map(g => g.id)
    );
    
    // Added groups
    for (const group of currentState.store.getAll()) {
      if (!baseGroupIds.has(group.id)) {
        delta.groupsAdded.push(this.serializeGroup(group));
      }
    }
    
    // Deleted groups
    for (const baseGroup of this.baseState.groups.groups) {
      if (!currentGroupIds.has(baseGroup.id)) {
        delta.groupsDeleted.push(baseGroup.id);
      }
    }
    
    // Modified groups
    for (const group of currentState.store.getAll()) {
      if (baseGroupIds.has(group.id)) {
        const baseGroup = this.baseState.groups.groups.find(g => g.id === group.id)!;
        const groupDelta = this.computeGroupDelta(baseGroup, group);
        if (groupDelta) {
          delta.groupsModified.push(groupDelta);
        }
      }
    }
    
    // Similar for deductions...
    
    return delta;
  }
  
  applyDelta(baseState: SerializedBSPState, delta: DeltaState): SerializedBSPState {
    const result = structuredClone(baseState);
    
    // Apply group changes
    // Remove deleted
    result.groups.groups = result.groups.groups.filter(
      g => !delta.groupsDeleted.includes(g.id)
    );
    
    // Add new
    result.groups.groups.push(...delta.groupsAdded);
    
    // Apply modifications
    for (const mod of delta.groupsModified) {
      const group = result.groups.groups.find(g => g.id === mod.id);
      if (group) {
        this.applyGroupDelta(group, mod);
      }
    }
    
    // Update count
    result.groups.count = result.groups.groups.length;
    
    // Similar for deductions...
    
    return result;
  }
}
```

---

## 7. Snapshots și Time Travel

### 7.1 Snapshot Manager

```typescript
class SnapshotManager {
  private snapshotsDir: string;
  private maxSnapshots: number;
  
  async createSnapshot(
    sessionId: string,
    state: BSPState,
    label?: string
  ): Promise<string> {
    const snapshotId = `${sessionId}_${Date.now()}`;
    const path = `${this.snapshotsDir}/${snapshotId}.bpcm`;
    
    const serializer = new BSPSerializer();
    const buffer = await serializer.serialize(state);
    
    await fs.writeFile(path, buffer);
    
    // Create metadata
    await fs.writeFile(
      `${path}.meta`,
      JSON.stringify({
        sessionId,
        snapshotId,
        label,
        created: Date.now(),
        stats: {
          groupCount: state.store.size,
          messageCount: state.session?.messageCount || 0,
        },
      })
    );
    
    // Cleanup old snapshots
    await this.cleanup(sessionId);
    
    return snapshotId;
  }
  
  async listSnapshots(sessionId: string): Promise<SnapshotInfo[]> {
    const files = await fs.readdir(this.snapshotsDir);
    const snapshots: SnapshotInfo[] = [];
    
    for (const file of files) {
      if (file.startsWith(sessionId) && file.endsWith('.bpcm.meta')) {
        const meta = JSON.parse(
          await fs.readFile(`${this.snapshotsDir}/${file}`, 'utf8')
        );
        snapshots.push(meta);
      }
    }
    
    return snapshots.sort((a, b) => b.created - a.created);
  }
  
  async restoreSnapshot(snapshotId: string): Promise<BSPState> {
    const path = `${this.snapshotsDir}/${snapshotId}.bpcm`;
    const buffer = await fs.readFile(path);
    
    const serializer = new BSPSerializer();
    return serializer.deserialize(buffer);
  }
  
  private async cleanup(sessionId: string): Promise<void> {
    const snapshots = await this.listSnapshots(sessionId);
    
    if (snapshots.length > this.maxSnapshots) {
      const toDelete = snapshots.slice(this.maxSnapshots);
      
      for (const snapshot of toDelete) {
        await fs.unlink(`${this.snapshotsDir}/${snapshot.snapshotId}.bpcm`);
        await fs.unlink(`${this.snapshotsDir}/${snapshot.snapshotId}.bpcm.meta`);
      }
    }
  }
}
```

---

## 8. Export/Import

### 8.1 Portable Format

```typescript
interface PortableExport {
  format: 'bpcm-export';
  version: '1.0';
  exported: number;
  
  // Full state (JSON-compatible)
  state: SerializedBSPState;
  
  // Optional: full message history
  history?: SerializedMessage[];
}

class Exporter {
  async exportToJSON(session: Session): Promise<string> {
    const state = session.getState();
    const serializer = new JSONSerializer();
    
    const portable: PortableExport = {
      format: 'bpcm-export',
      version: '1.0',
      exported: Date.now(),
      state: await serializer.toSerializable(state),
      history: session.getFullHistory(),
    };
    
    return JSON.stringify(portable, null, 2);
  }
  
  async importFromJSON(json: string): Promise<BSPState> {
    const portable = JSON.parse(json) as PortableExport;
    
    if (portable.format !== 'bpcm-export') {
      throw new Error('Invalid export format');
    }
    
    const serializer = new JSONSerializer();
    return serializer.fromSerializable(portable.state);
  }
}
```

---

## 9. Performanță

### 9.1 Benchmarks Target

| Operație | Target | Cu compresie |
|----------|--------|--------------|
| Save (10K groups) | < 100ms | < 200ms |
| Load (10K groups) | < 150ms | < 300ms |
| Delta save | < 50ms | < 100ms |
| Snapshot create | < 500ms | < 1s |

### 9.2 Optimizări

```typescript
// Lazy loading pentru grupuri
class LazyGroupStore {
  private loaded: Map<number, Group> = new Map();
  private serialized: Map<number, SerializedGroup> = new Map();
  
  get(id: number): Group {
    let group = this.loaded.get(id);
    
    if (!group) {
      const serialized = this.serialized.get(id);
      if (serialized) {
        group = this.deserializeGroup(serialized);
        this.loaded.set(id, group);
      }
    }
    
    return group!;
  }
}

// Streaming serialization pentru fișiere mari
async function* serializeStream(state: BSPState): AsyncGenerator<Buffer> {
  // Header
  yield createHeader(state);
  
  // Groups in chunks
  for (const chunk of chunkArray(state.store.getAll(), 1000)) {
    yield serializeGroupChunk(chunk);
  }
  
  // Deductions
  yield serializeDeductions(state.graph);
  
  // Footer with checksum
  yield createFooter();
}
```

---

## 10. Error Handling

### 10.1 Corruption Detection

```typescript
class IntegrityChecker {
  async verify(buffer: Buffer): Promise<VerificationResult> {
    try {
      // Check header
      if (!this.verifyHeader(buffer)) {
        return { valid: false, error: 'Invalid header' };
      }
      
      // Check checksum
      const stored = this.extractChecksum(buffer);
      const computed = this.computeChecksum(buffer);
      
      if (stored !== computed) {
        return { valid: false, error: 'Checksum mismatch' };
      }
      
      // Try to deserialize
      const serializer = new BSPSerializer();
      await serializer.deserialize(buffer);
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  async repair(buffer: Buffer): Promise<Buffer | null> {
    // Attempt partial recovery
    // ...
  }
}
```

---

## 11. Diagrama Flow

```
                    Session
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
       In-Memory   Auto-Save   User Save
           │           │           │
           ▼           ▼           ▼
    ┌─────────────────────────────────┐
    │         Serializer              │
    │  (toSerializable → encode →     │
    │   compress → addHeader)         │
    └─────────────────────────────────┘
                    │
                    ▼
    ┌─────────────────────────────────┐
    │         .bpcm File              │
    │  [Header][Compressed MsgPack]   │
    └─────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Session     Snapshot     Export
     Storage     Archive      (JSON)
```
