/**
 * Generates a random 6-digit room code with format XXX-XXX
 * e.g., 482-194
 */
export function generateRoomCode(): string {
  let val: number;
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    val = array[0] % 1_000_000;
  } else {
    val = Math.floor(Math.random() * 1_000_000);
  }
  const str = val.toString().padStart(6, '0');
  return `${str.slice(0, 3)}-${str.slice(3)}`;
}

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
