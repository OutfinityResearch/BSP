/**
 * BSP Main Entry Point
 * Starts the HTTP server for chat interface
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BSPServer } from './server/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from environment or defaults
const config = {
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
  sessionsDir: process.env.SESSIONS_DIR || path.join(__dirname, '../data/sessions'),
  publicDir: path.join(__dirname, '../public'),
};

// Create and start server
const server = new BSPServer(config);
await server.start();

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.stop().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop().catch(() => {});
  process.exit(0);
});

export { server };
