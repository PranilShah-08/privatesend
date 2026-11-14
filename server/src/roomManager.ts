import { generateRoomCode } from './utils/codeGenerator.js';
import type { RoomInfo, RoomStatus } from '../../shared/types.js';

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
   * Creates an ephemeral room assigned to the receiver socket
   */
  public createRoom(receiverSocketId: string): RoomInfo {
    // Clean up any existing room this socket had
    this.handleDisconnect(receiverSocketId);

    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const now = Date.now();
    const room: RoomInfo = {
      code,
      receiverSocketId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: 'waiting',
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(receiverSocketId, { code, role: 'receiver' });

    return room;
  }

  /**
   * Allows exactly one sender to join the room, locking it immediately
   */
  public joinRoom(code: string, senderSocketId: string): JoinRoomResult {
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

    if (room.status !== 'waiting' || room.senderSocketId) {
      return {
        success: false,
        errorCode: 'ROOM_LOCKED',
        errorMessage: 'Room is already locked with two parties. Access denied.',
      };
    }

    // Lock room strictly for these two parties
    room.senderSocketId = senderSocketId;
    room.status = 'locked';

    this.socketToRoom.set(senderSocketId, { code, role: 'sender' });

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
