import { describe, it, expect } from 'vitest';
import { getFriendlyDeviceName } from '../src/services/wifiDiscoveryService.js';

describe('wifiDiscoveryService', () => {
  it('identifies macOS devices properly', () => {
    const mockUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    expect(getFriendlyDeviceName(mockUA)).toContain('Mac');
  });

  it('identifies Windows devices properly', () => {
    const mockUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(getFriendlyDeviceName(mockUA)).toContain('Windows');
  });

  it('identifies iPhone / iOS devices properly', () => {
    const mockUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(getFriendlyDeviceName(mockUA)).toContain('iPhone');
  });

  it('identifies Android devices properly', () => {
    const mockUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
    expect(getFriendlyDeviceName(mockUA)).toContain('Android');
  });

  it('defaults to generic Device when UA is unknown or blank', () => {
    expect(getFriendlyDeviceName('')).toBe('Local Device');
    expect(getFriendlyDeviceName('CustomBot/1.0')).toBe('Local Device');
    expect(getFriendlyDeviceName(undefined)).toBe('Local Device');
  });

  it('identifies Linux and iPad devices properly', () => {
    expect(getFriendlyDeviceName('Mozilla/5.0 (X11; Ubuntu; Linux x86_64)')).toBe('Linux Device');
    expect(getFriendlyDeviceName('Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)')).toBe('iPad');
  });
});
