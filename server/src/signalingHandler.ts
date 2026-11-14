import type { Server, Socket } from 'socket.io';
import type { RoomManager } from './roomManager.js';
import type { SlidingRateLimiter } from './rateLimiter.js';
import { normalizeRoomCode } from './utils/codeGenerator.js';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types.js';

export function setupSignalingHandler(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  rateLimiter: SlidingRateLimiter
) {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    // Extract real client IP behind reverse proxy / ingress
    const forwardedHeader = socket.handshake.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedHeader)
      ? forwardedHeader[0]
      : typeof forwardedHeader === 'string'
      ? forwardedHeader.split(',')[0].trim()
      : undefined;
    const clientIp = forwardedIp || socket.handshake.address || 'unknown';

    // 1. Create Room (Receiver)
    socket.on('room:create', () => {
      const room = roomManager.createRoom(socket.id);
      socket.join(room.code);
      socket.emit('room:created', {
        code: room.code,
        expiresAt: room.expiresAt,
      });
    });

    // 2. Join Room (Sender)
    socket.on('room:join', (data) => {
      if (!data || typeof data.code !== 'string') {
        socket.emit('error', {
          code: 'INVALID_INPUT',
          message: 'Room code must be a string.',
        });
        return;
      }

      const normalized = normalizeRoomCode(data.code);

      // Check anti-brute-force rate limit
      if (!rateLimiter.check(clientIp)) {
        socket.emit('error', {
          code: 'RATE_LIMITED',
          message: 'Too many incorrect attempts. Please wait before trying again.',
        });
        return;
      }

      const result = roomManager.joinRoom(normalized, socket.id);

      if (!result.success || !result.room) {
        rateLimiter.recordFailure(clientIp);
        socket.emit('error', {
          code: result.errorCode ?? 'ROOM_ERROR',
          message: result.errorMessage ?? 'Unable to join room.',
        });
        return;
      }

      // Record success to reset penalty
      rateLimiter.recordSuccess(clientIp);

      socket.join(normalized);
      socket.emit('room:joined', {
        code: normalized,
        role: 'sender',
      });

      // Notify the receiver that sender has connected
      socket.to(result.room.receiverSocketId).emit('peer:connected', {
        role: 'sender',
      });

      // Notify sender that receiver is present
      socket.emit('peer:connected', {
        role: 'receiver',
      });
    });

    // 3. WebRTC SDP Offer Relay
    socket.on('webrtc:offer', ({ code, sdp }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      if (!room || (socket.id !== room.receiverSocketId && socket.id !== room.senderSocketId)) {
        return;
      }
      const targetId = socket.id === room.receiverSocketId ? room.senderSocketId : room.receiverSocketId;
      if (targetId) {
        socket.to(targetId).emit('webrtc:offer', { sdp });
      }
    });

    // 4. WebRTC SDP Answer Relay
    socket.on('webrtc:answer', ({ code, sdp }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      if (!room || (socket.id !== room.receiverSocketId && socket.id !== room.senderSocketId)) {
        return;
      }
      const targetId = socket.id === room.receiverSocketId ? room.senderSocketId : room.receiverSocketId;
      if (targetId) {
        socket.to(targetId).emit('webrtc:answer', { sdp });
      }
    });

    // 5. WebRTC ICE Candidate Relay
    socket.on('webrtc:ice-candidate', ({ code, candidate }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      if (!room || (socket.id !== room.receiverSocketId && socket.id !== room.senderSocketId)) {
        return;
      }
      const targetId = socket.id === room.receiverSocketId ? room.senderSocketId : room.receiverSocketId;
      if (targetId) {
        socket.to(targetId).emit('webrtc:ice-candidate', { candidate });
      }
    });

    // 6. Ephemeral Fallback Relay with Strict Authorization
    socket.on('relay:manifest', ({ code, manifest }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      // Sender-only authorization for manifest
      if (!room || socket.id !== room.senderSocketId || !room.receiverSocketId) return;
      socket.to(room.receiverSocketId).emit('relay:manifest', manifest);
    });

    socket.on('relay:chunk', ({ code, chunkIndex, totalChunks, data }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      // Sender-only authorization for data chunks
      if (!room || socket.id !== room.senderSocketId || !room.receiverSocketId) return;
      socket.to(room.receiverSocketId).emit('relay:chunk', { chunkIndex, totalChunks, data });
    });

    socket.on('relay:complete', ({ code, fileId }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      // Sender-only authorization for completion
      if (!room || socket.id !== room.senderSocketId || !room.receiverSocketId) return;
      socket.to(room.receiverSocketId).emit('relay:complete', { fileId });
    });

    socket.on('relay:integrity', ({ code, report }) => {
      if (typeof code !== 'string') return;
      const room = roomManager.getRoom(code);
      // Receiver-only authorization for integrity reports
      if (!room || socket.id !== room.receiverSocketId || !room.senderSocketId) return;
      socket.to(room.senderSocketId).emit('relay:integrity', report);
    });

    // 7. Disconnect / Leave Handling
    const handleLeaveOrDisconnect = () => {
      const result = roomManager.handleDisconnect(socket.id);
      if (result?.peerSocketId) {
        socket.to(result.peerSocketId).emit('peer:disconnected', {
          reason: 'Peer disconnected from session.',
        });
      }
    };

    socket.on('disconnect', handleLeaveOrDisconnect);
  });
}
