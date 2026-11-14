import crypto from 'node:crypto';

/**
 * Generates a random 6-digit room code with format XXX-XXX
 * e.g., 482-194
 */
export function generateRoomCode(): string {
  const num = crypto.randomInt(0, 1_000_000);
  const str = num.toString().padStart(6, '0');
  return `${str.slice(0, 3)}-${str.slice(3)}`;
}

/**
 * Normalizes input string to XXX-XXX format by extracting digits
 */
export function normalizeRoomCode(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 6);
  if (digits.length < 6) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
}

/**
 * Validates whether string conforms to XXX-XXX (6 numeric digits)
 */
export function isValidRoomCode(code: string): boolean {
  return /^\d{3}-\d{3}$/.test(code);
}
