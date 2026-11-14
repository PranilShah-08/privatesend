import { describe, it, expect } from 'vitest';
import { normalizeRoomCode, isValidRoomCode } from '../src/utils/codeValidator.js';

describe('codeValidator', () => {
  it('normalizes digits with hyphen properly', () => {
    expect(normalizeRoomCode('123')).toBe('123');
    expect(normalizeRoomCode('1234')).toBe('123-4');
    expect(normalizeRoomCode('123456')).toBe('123-456');
    expect(normalizeRoomCode('123 456')).toBe('123-456');
    expect(normalizeRoomCode('123-456-789')).toBe('123-456');
  });

  it('validates correct code structure', () => {
    expect(isValidRoomCode('123-456')).toBe(true);
    expect(isValidRoomCode('999-000')).toBe(true);
    expect(isValidRoomCode('12-345')).toBe(false);
    expect(isValidRoomCode('123456')).toBe(false);
    expect(isValidRoomCode('abc-def')).toBe(false);
  });
});
