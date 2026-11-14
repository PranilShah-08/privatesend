import { describe, it, expect, beforeEach } from 'vitest';
import { SpeedCalculator, formatBytes, formatTime } from '../src/services/speedCalculator.js';

describe('SpeedCalculator', () => {
  let calc: SpeedCalculator;

  beforeEach(() => {
    calc = new SpeedCalculator();
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatBytes(2500000)).toBe('2.4 MB');
  });

  it('formats time correctly', () => {
    expect(formatTime(0)).toBe('0s');
    expect(formatTime(45)).toBe('45s');
    expect(formatTime(65)).toBe('1m 5s');
    expect(formatTime(3665)).toBe('1h 1m');
  });

  it('calculates speed and ETA accurately', () => {
    const totalBytes = 10 * 1024 * 1024; // 10 MB
    const baseTime = 10000;
    calc.start(totalBytes, baseTime);

    // Simulate transfer: 2MB transferred 1 second later
    const stats = calc.update(2 * 1024 * 1024, baseTime + 1000);

    expect(stats.percentage).toBe(20);
    expect(stats.bytesTransferred).toBe(2 * 1024 * 1024);
    expect(stats.speedBps).toBeGreaterThan(0);
    expect(stats.speedFormatted).toContain('/s');
    expect(stats.etaSeconds).toBeGreaterThan(0);
  });
});
