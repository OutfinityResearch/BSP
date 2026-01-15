/**
 * BSP Main Entry Point
 * Starts the HTTP server for chat interface
 */

const { BPCMServer } = require('./server');
const path = require('path');

// Configuration from environment or defaults
const config = {
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
  sessionsDir: process.env.SESSIONS_DIR || path.join(__dirname, '../data/sessions'),
  publicDir: path.join(__dirname, '../public'),
};

// Create and start server
const server = new BPCMServer(config);
server.start();

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});

module.exports = { server };
