# DS-018: Coding Style and Module Format (ESM + Async/Await)

**Version**: 1.0  
**Status**: Draft  
**Author**: BSP Team  
**Date**: 2026-01-15

---

## 1. Scope

This document defines project-wide coding conventions for BSP:

- module format (ESM)
- asynchronous style (`async/await`)
- dependency policy (Node.js built-ins only)
- documentation language

These conventions exist to keep the codebase easy to read, consistent, and fast to refactor.

---

## 2. Language

- All repository artifacts written to disk (code, docs, HTML, markdown, comments) must be in **English**.

---

## 3. Dependencies

- No external runtime dependencies.
- Prefer Node.js built-in modules (e.g. `node:fs`, `node:http`, `node:path`, `node:crypto`, `node:events`).

---

## 4. Module Format (ESM)

### 4.1 File Extensions

- Use `.mjs` for all JavaScript source files in `src/`, `scripts/`, and `tests/`.

### 4.2 Imports

- Use ESM `import`/`export` exclusively.
- Use explicit file extensions in internal imports.

Example:

```js
import { BSPEngine } from '../core/BSPEngine.mjs';
```

### 4.3 Exports

- Prefer named exports for library-style modules.
- Avoid default exports unless there is a strong ergonomic reason.

---

## 5. Async/Await Style

- Prefer `async/await` over `.then()` chains.
- Avoid `new Promise((resolve, reject) => ...)` wrappers around callback APIs when there is a built-in promise API or a small helper available.

Examples:

Use `node:events`:

```js
import { once } from 'node:events';
await once(server, 'listening');
```

Use `node:fs/promises`:

```js
import { readFile } from 'node:fs/promises';
const text = await readFile(path, 'utf8');
```

---

## 6. Error Handling

- Prefer throwing `Error` with actionable messages.
- Surface errors to callers rather than swallowing them, except when best-effort behavior is explicitly intended (e.g. cleanup routines).

