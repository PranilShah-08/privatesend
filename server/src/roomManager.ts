import { generateRoomCode } from './utils/codeGenerator.js';
import type { RoomInfo, RoomStatus, RoomType } from '../../shared/types.js';

export interface RoomManagerOptions {
  ttlMs?: number;
}

export interface JoinRoomResult {
  success: boolean;
  room?: RoomInfo;
  errorCode?: 'ROOM_NOT_FOUND' | 'ROOM_LOCKED' | 'ROOM_EXPIRED';
  errorMessage?: string;
}

export interface DisconnectResult {
  code: string;
  peerSocketId?: string;
  peerSocketIds?: string[];
  role: 'receiver' | 'sender';
}

export class RoomManager {
  private rooms = new Map<string, RoomInfo>();
  private socketToRoom = new Map<string, { code: string; role: 'receiver' | 'sender' }>();
  private readonly ttlMs: number;

  constructor(options: RoomManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000; // 10 minutes default
  }

  /**
   * Creates an ephemeral room assigned to the host socket (either 1-to-1 direct or 1-to-many broadcast)
   */
  public createRoom(hostSocketId: string, type: RoomType = 'direct'): RoomInfo {
    // Clean up any existing room this socket had
    this.handleDisconnect(hostSocketId);

    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const now = Date.now();
    const isBroadcast = type === 'broadcast';

    const room: RoomInfo = {
      code,
      receiverSocketId: hostSocketId,
      type,
      receiverSocketIds: isBroadcast ? [] : undefined,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: 'waiting',
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(hostSocketId, { code, role: isBroadcast ? 'sender' : 'receiver' });

    return room;
  }

  /**
   * Allows joining a room. For direct rooms, locks on first sender. For broadcast rooms, allows multiple receivers.
   */
  public joinRoom(code: string, socketId: string): JoinRoomResult {
    const room = this.rooms.get(code);

    if (!room) {
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        errorMessage: 'Room code does not exist or has expired.',
      };
    }

    if (Date.now() > room.expiresAt) {
      this.destroyRoom(code);
      return {
        success: false,
        errorCode: 'ROOM_EXPIRED',
        errorMessage: 'Room code has expired.',
      };
    }

    if (room.type === 'broadcast') {
      room.receiverSocketIds = room.receiverSocketIds || [];
      if (!room.receiverSocketIds.includes(socketId)) {
        room.receiverSocketIds.push(socketId);
      }
      this.socketToRoom.set(socketId, { code, role: 'receiver' });
      return {
        success: true,
        room,
      };
    }

    // Direct 1-to-1 room logic
    if (room.status !== 'waiting' || room.senderSocketId) {
      return {
        success: false,
        errorCode: 'ROOM_LOCKED',
        errorMessage: 'Room is already locked with two parties. Access denied.',
      };
    }

    room.senderSocketId = socketId;
    room.status = 'locked';
    this.socketToRoom.set(socketId, { code, role: 'sender' });

    return {
      success: true,
      room,
    };
  }

  public getRoom(code: string): RoomInfo | undefined {
    return this.rooms.get(code);
  }

  public updateRoomStatus(code: string, status: RoomStatus): void {
    const room = this.rooms.get(code);
    if (room) {
      room.status = status;
    }
  }

  /**
   * Handles socket disconnect, cleaning up room and returning peer socket info
   */
  public handleDisconnect(socketId: string): DisconnectResult | undefined {
    const mapping = this.socketToRoom.get(socketId);
    if (!mapping) return undefined;

    const { code, role } = mapping;
    const room = this.rooms.get(code);

    if (room?.type === 'broadcast') {
      const isHost = socketId === room.receiverSocketId;
      if (isHost) {
        const remainingPeers = [...(room.receiverSocketIds || [])];
        this.destroyRoom(code);
        return {
          code,
          peerSocketIds: remainingPeers,
          role: 'sender',
        };
      } else {
        // A single receiver left
        if (room.receiverSocketIds) {
          room.receiverSocketIds = room.receiverSocketIds.filter((id) => id !== socketId);
        }
        this.socketToRoom.delete(socketId);
        return {
          code,
          peerSocketId: room.receiverSocketId,
          role: 'receiver',
        };
      }
    }

    // Direct 1-to-1 room
    let peerSocketId: string | undefined;
    if (room) {
      peerSocketId = role === 'receiver' ? room.senderSocketId : room.receiverSocketId;
    }

    this.destroyRoom(code);
    return {
      code,
      peerSocketId,
      role,
    };
  }

  public destroyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      this.socketToRoom.delete(room.receiverSocketId);
      if (room.senderSocketId) {
        this.socketToRoom.delete(room.senderSocketId);
      }
      if (room.receiverSocketIds) {
        for (const id of room.receiverSocketIds) {
          this.socketToRoom.delete(id);
        }
      }
      this.rooms.delete(code);
    }
  }

  public pruneExpiredRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now > room.expiresAt) {
        this.destroyRoom(code);
      }
    }
  }
}
