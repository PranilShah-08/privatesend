import { describe, it, expect } from 'vitest';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from '../src/utils/codeGenerator.js';

describe('codeGenerator', () => {
  it('generates a 6-digit room code with hyphen format XXX-XXX', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^\d{3}-\d{3}$/);
  });

  it('generates unique codes with low collision probability', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      codes.add(generateRoomCode());
    }
    // High entropy check
    expect(codes.size).toBeGreaterThan(490);
  });

  it('normalizes room code by stripping spaces, extra hyphens, and non-digits', () => {
    expect(normalizeRoomCode(' 123 - 456 ')).toBe('123-456');
    expect(normalizeRoomCode('123456')).toBe('123-456');
    expect(normalizeRoomCode('12-34-56')).toBe('123-456');
  });

  it('validates correct code format', () => {
    expect(isValidRoomCode('123-456')).toBe(true);
    expect(isValidRoomCode('000-000')).toBe(true);
    expect(isValidRoomCode('999-999')).toBe(true);
    expect(isValidRoomCode('12-3456')).toBe(false);
    expect(isValidRoomCode('abc-def')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });
});
