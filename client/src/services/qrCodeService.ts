import QRCode from 'qrcode';

export function getRoomShareUrl(roomCode: string, customBaseUrl?: string): string {
  let baseUrl = customBaseUrl;
  if (!baseUrl && typeof window !== 'undefined') {
    baseUrl = window.location.origin + window.location.pathname;
  }
  if (!baseUrl) {
    baseUrl = 'https://pranilshah-08.github.io/privatesend/';
  }

  // Ensure clean hash format
  const cleanBase = baseUrl.split('#')[0].replace(/\/+$/, '');
  return `${cleanBase}/#code=${encodeURIComponent(roomCode)}`;
}

export async function generateRoomQrSvg(
  roomCode: string,
  isDark = false,
  baseUrl?: string
): Promise<string> {
  const shareUrl = getRoomShareUrl(roomCode, baseUrl);
  return QRCode.toString(shareUrl, {
    type: 'svg',
    margin: 1,
    color: {
      dark: isDark ? '#ffffff' : '#18181b', // zinc-900 / white
      light: isDark ? '#18181b' : '#ffffff',
    },
  });
}

export async function generateRoomQrDataUrl(
  roomCode: string,
  isDark = false,
  baseUrl?: string
): Promise<string> {
  const shareUrl = getRoomShareUrl(roomCode, baseUrl);
  return QRCode.toDataURL(shareUrl, {
    margin: 1,
    width: 256,
    color: {
      dark: isDark ? '#ffffff' : '#18181b',
      light: isDark ? '#18181b' : '#ffffff',
    },
  });
}
