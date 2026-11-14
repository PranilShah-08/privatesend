import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../src/roomManager.js';

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager({ ttlMs: 10000 });
  });

  it('creates an ephemeral room with unique code and receiver', () => {
    const room = manager.createRoom('receiver-sock-1');
    expect(room.code).toMatch(/^\d{3}-\d{3}$/);
    expect(room.receiverSocketId).toBe('receiver-sock-1');
    expect(room.status).toBe('waiting');
    expect(manager.getRoom(room.code)).toBeDefined();
  });

  it('allows a sender to join an existing waiting room and locks it', () => {
    const room = manager.createRoom('receiver-sock-1');
    const result = manager.joinRoom(room.code, 'sender-sock-2');

    expect(result.success).toBe(true);
    expect(result.room?.status).toBe('locked');
    expect(result.room?.senderSocketId).toBe('sender-sock-2');
  });

  it('rejects a third party from joining an already locked room', () => {
    const room = manager.createRoom('receiver-sock-1');
    manager.joinRoom(room.code, 'sender-sock-2');

    const thirdPartyResult = manager.joinRoom(room.code, 'attacker-sock-3');
    expect(thirdPartyResult.success).toBe(false);
    expect(thirdPartyResult.errorCode).toBe('ROOM_LOCKED');
  });

  it('rejects joining a non-existent room', () => {
    const result = manager.joinRoom('999-999', 'sender-sock-2');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ROOM_NOT_FOUND');
  });

  it('rejects joining an expired room', () => {
    const room = manager.createRoom('receiver-sock-1');
    room.expiresAt = Date.now() - 100;
    const result = manager.joinRoom(room.code, 'sender-sock-2');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ROOM_EXPIRED');
  });

  it('updates room status when requested', () => {
    const room = manager.createRoom('receiver-sock-1');
    manager.updateRoomStatus(room.code, 'transferring');
    expect(manager.getRoom(room.code)?.status).toBe('transferring');
    manager.updateRoomStatus('unknown-code', 'completed');
  });

  it('handles disconnect from unknown socket gracefully', () => {
    const result = manager.handleDisconnect('unknown-sock');
    expect(result).toBeUndefined();
  });

  it('removes room when receiver disconnects', () => {
    const room = manager.createRoom('receiver-sock-1');
    manager.joinRoom(room.code, 'sender-sock-2');

    const affected = manager.handleDisconnect('receiver-sock-1');
    expect(affected).toBeDefined();
    expect(affected?.peerSocketId).toBe('sender-sock-2');
    expect(manager.getRoom(room.code)).toBeUndefined();
  });

  it('removes room when sender disconnects', () => {
    const room = manager.createRoom('receiver-sock-1');
    manager.joinRoom(room.code, 'sender-sock-2');

    const affected = manager.handleDisconnect('sender-sock-2');
    expect(affected).toBeDefined();
    expect(affected?.peerSocketId).toBe('receiver-sock-1');
    expect(manager.getRoom(room.code)).toBeUndefined();
  });

  it('cleans up expired rooms', () => {
    const shortTtlManager = new RoomManager({ ttlMs: 1 });
    const room = shortTtlManager.createRoom('receiver-sock-1');
    
    // Fast forward timestamp simulated
    room.expiresAt = Date.now() - 100;
    shortTtlManager.pruneExpiredRooms();

    expect(shortTtlManager.getRoom(room.code)).toBeUndefined();
  });
});
