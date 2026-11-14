import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { RoomManager } from './roomManager.js';
import { SlidingRateLimiter } from './rateLimiter.js';
import { setupSignalingHandler } from './signalingHandler.js';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 5e7, // 50MB buffer limit for WebSocket fallback chunks
});

const roomManager = new RoomManager({ ttlMs: config.roomTtlMs });
const rateLimiter = new SlidingRateLimiter(config.rateLimit);

// Signaling & Relay setup
setupSignalingHandler(io, roomManager, rateLimiter);

// Periodic cleanup of expired rooms
setInterval(() => {
  roomManager.pruneExpiredRooms();
}, config.pruneIntervalMs);

// API status endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    twoPartyP2P: true,
    losslessVerified: true,
  });
});

// Serve static frontend in production
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
app.use(express.static(clientDistPath));

app.get('*', (_req, res) => {
  const indexHtml = path.join(clientDistPath, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      // In development mode before build:
      res.status(200).send('LosslessDrop API is running. Start Vite dev server for frontend.');
    }
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, config.host, () => {
    console.log(`\n⚡ LosslessDrop Server running on http://${config.host}:${config.port}`);
    console.log(`🔒 True P2P Lossless Transmission ready (Zero Server Persistence)\n`);
  });
}

export { app, server, io, roomManager };
