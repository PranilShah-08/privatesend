import type { Server, Socket } from 'socket.io';
import type { RoomManager } from './roomManager.js';
import type { SlidingRateLimiter } from './rateLimiter.js';
import { normalizeRoomCode } from './utils/codeGenerator.js';
import { extractSubnetClusterId } from './utils/subnetCluster.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  NearbyPeer,
} from '../../shared/types.js';

export function setupSignalingHandler(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  rateLimiter: SlidingRateLimiter
) {
  // In-memory cluster presence (Zero disk persistence)
  const localPeersByCluster = new Map<string, Map<string, NearbyPeer>>();
  const socketToClusterId = new Map<string, string>();

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    // Extract real client IP behind reverse proxy / ingress
    const forwardedHeader = socket.handshake.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedHeader)
      ? forwardedHeader[0]
      : typeof forwardedHeader === 'string'
      ? forwardedHeader.split(',')[0].trim()
      : undefined;
    const clientIp = forwardedIp || socket.handshake.address || 'unknown';

    // 1. Create 1-to-1 Room (Receiver)
    socket.on('room:create', () => {
      const room = roomManager.createRoom(socket.id, 'direct');
      socket.join(room.code);
      socket.emit('room:created', {
        code: room.code,
        expiresAt: room.expiresAt,
        type: 'direct',
      });
    });

    // 2. Join 1-to-1 Room (Sender)
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
        type: result.room.type || 'direct',
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

    // 3. Create 1-to-Many Broadcast Room (Host Sender)
    socket.on('broadcast:create', () => {
      const room = roomManager.createRoom(socket.id, 'broadcast');
      socket.join(room.code);
      socket.emit('room:created', {
        code: room.code,
        expiresAt: room.expiresAt,
        type: 'broadcast',
      });
    });

    // 4. Join 1-to-Many Broadcast Room (Receivers)
    socket.on('broadcast:join', (data) => {
      if (!data || typeof data.code !== 'string') return;
      const normalized = normalizeRoomCode(data.code);
      const result = roomManager.joinRoom(normalized, socket.id);

      if (result.success && result.room) {
        socket.join(normalized);
        socket.emit('room:joined', {
          code: normalized,
          role: 'receiver',
          type: 'broadcast',
        });

        const receiverCount = result.room.receiverSocketIds?.length || 1;
        io.to(result.room.receiverSocketId).emit('broadcast:receiver-joined', {
          code: normalized,
          receiverCount,
          socketId: socket.id,
        });
      } else {
        socket.emit('error', {
          code: result.errorCode || 'ROOM_ERROR',
          message: result.errorMessage || 'Unable to join broadcast.',
        });
      }
    });

    // 5. Local Wi-Fi Presence Announcement
    socket.on('local:announce', (data) => {
      if (!data || !data.peerId) return;
      const clusterId = extractSubnetClusterId(clientIp);
      socket.join(`cluster:${clusterId}`);
      socketToClusterId.set(socket.id, clusterId);

      let peersMap = localPeersByCluster.get(clusterId);
      if (!peersMap) {
        peersMap = new Map();
        localPeersByCluster.set(clusterId, peersMap);
      }

      const peer: NearbyPeer = {
        socketId: socket.id,
        peerId: data.peerId,
        deviceName: data.deviceName || 'Nearby Device',
        joinedAt: Date.now(),
      };
      peersMap.set(socket.id, peer);

      // Broadcast peer list to everyone in the local subnet cluster
      const peerList = Array.from(peersMap.values());
      io.to(`cluster:${clusterId}`).emit('local:peers-updated', peerList);
    });

    // 6. Local Wi-Fi Transfer Request & Consent
    socket.on('local:request-transfer', (req) => {
      if (!req || !req.targetSocketId) return;
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      io.to(req.targetSocketId).emit('local:incoming-request', {
        ...req,
        requestId,
        senderSocketId: socket.id,
      });
    });

    socket.on('local:respond-transfer', (res) => {
      if (!res || !res.senderSocketId) return;
      if (res.accepted) {
        io.to(res.senderSocketId).emit('local:request-accepted', {
          requestId: res.requestId,
          receiverPeerId: res.receiverPeerId || '',
        });
      } else {
        io.to(res.senderSocketId).emit('local:request-declined', {
          requestId: res.requestId,
          reason: 'Receiver declined the transfer request.',
        });
      }
    });

    // 7. WebRTC Signaling Relays
    socket.on('webrtc:offer', ({ code, sdp }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('webrtc:offer', { sdp });
    });

    socket.on('webrtc:answer', ({ code, sdp }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('webrtc:answer', { sdp });
    });

    socket.on('webrtc:ice-candidate', ({ code, candidate }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('webrtc:ice-candidate', { candidate });
    });

    // 8. Ephemeral Relay Fallbacks
    socket.on('relay:manifest', ({ code, manifest }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('relay:manifest', manifest);
    });

    socket.on('relay:batch-manifest', ({ code, manifest }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('relay:batch-manifest', manifest);
    });

    socket.on('relay:chunk', ({ code, chunkIndex, totalChunks, data }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('relay:chunk', { chunkIndex, totalChunks, data });
    });

    socket.on('relay:complete', ({ code, fileId }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('relay:complete', { fileId });
    });

    socket.on('relay:integrity', ({ code, report }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('relay:integrity', report);
    });

    socket.on('relay:batch-integrity', ({ code, report }) => {
      if (typeof code !== 'string') return;
      socket.to(code).emit('relay:batch-integrity', report);
    });

    // 9. Disconnect / Leave Handling
    const handleLeaveOrDisconnect = () => {
      // Clean up local cluster presence
      const clusterId = socketToClusterId.get(socket.id);
      if (clusterId) {
        socketToClusterId.delete(socket.id);
        const peersMap = localPeersByCluster.get(clusterId);
        if (peersMap) {
          peersMap.delete(socket.id);
          if (peersMap.size === 0) {
            localPeersByCluster.delete(clusterId);
          } else {
            const peerList = Array.from(peersMap.values());
            io.to(`cluster:${clusterId}`).emit('local:peers-updated', peerList);
          }
        }
      }

      // Clean up room manager
      const result = roomManager.handleDisconnect(socket.id);
      if (result) {
        if (result.peerSocketId) {
          socket.to(result.peerSocketId).emit('peer:disconnected', {
            reason: 'Peer disconnected from session.',
          });
          // Also notify broadcast host if receiver left
          const room = roomManager.getRoom(result.code);
          const receiverCount = room?.receiverSocketIds?.length || 0;
          socket.to(result.peerSocketId).emit('broadcast:receiver-left', {
            code: result.code,
            receiverCount,
            socketId: socket.id,
          });
        }
        if (result.peerSocketIds) {
          for (const peerId of result.peerSocketIds) {
            socket.to(peerId).emit('peer:disconnected', {
              reason: 'Broadcast host terminated session.',
            });
          }
        }
      }
    };

    socket.on('disconnect', handleLeaveOrDisconnect);
    socket.on('room:leave', handleLeaveOrDisconnect);
  });
}
