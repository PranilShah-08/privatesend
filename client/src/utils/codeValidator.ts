/**
 * Normalizes user input into XXX-XXX format
 */
export function normalizeRoomCode(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 3) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
}

export function isValidRoomCode(code: string): boolean {
  return /^\d{3}-\d{3}$/.test(code);
}
