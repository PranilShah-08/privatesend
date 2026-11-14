import { describe, it, expect } from 'vitest';
import {
  generateRoomQrSvg,
  generateRoomQrDataUrl,
  getRoomShareUrl,
} from '../src/services/qrCodeService.js';

describe('QRCodeService (v2)', () => {
  it('constructs correct room share URLs with and without custom base', () => {
    const code = '482-194';
    const url = getRoomShareUrl(code, 'https://example.com/privatesend/');
    expect(url).toBe('https://example.com/privatesend/#code=482-194');

    const defaultUrl = getRoomShareUrl(code);
    expect(defaultUrl).toContain('#code=482-194');

    // Test with mock window
    (global as any).window = {
      location: {
        origin: 'http://localhost:3000',
        pathname: '/app/',
      },
    };
    const windowUrl = getRoomShareUrl(code);
    expect(windowUrl).toBe('http://localhost:3000/app/#code=482-194');
    delete (global as any).window;
  });

  it('generates a valid SVG QR code string for light and dark modes', async () => {
    const code = '555-012';
    const svgLight = await generateRoomQrSvg(code, false, 'https://example.com/');
    expect(svgLight).toContain('<svg');
    expect(svgLight).toContain('</svg>');
    expect(svgLight).toContain('viewBox');

    const svgDark = await generateRoomQrSvg(code, true, 'https://example.com/');
    expect(svgDark).toContain('<svg');
  });

  it('generates a valid data URL QR code string for light and dark modes', async () => {
    const code = '123-456';
    const dataUrlLight = await generateRoomQrDataUrl(code, false, 'https://example.com/');
    expect(dataUrlLight.startsWith('data:image/')).toBe(true);

    const dataUrlDark = await generateRoomQrDataUrl(code, true);
    expect(dataUrlDark.startsWith('data:image/')).toBe(true);
  });
});
