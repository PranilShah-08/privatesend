/**
 * Generates an intuitive, privacy-friendly device name based on the client browser/OS
 * without exposing personal hardware serials or IP addresses.
 */
export function getFriendlyDeviceName(userAgent?: string): string {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return 'Local Device';

  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android Device';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac Device';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux Device';

  return 'Local Device';
}
