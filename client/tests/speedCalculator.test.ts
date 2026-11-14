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
    const stats1 = calc.update(2 * 1024 * 1024, baseTime + 1000);

    expect(stats1.percentage).toBe(20);
    expect(stats1.bytesTransferred).toBe(2 * 1024 * 1024);
    expect(stats1.speedBps).toBeGreaterThan(0);
    expect(stats1.speedFormatted).toContain('/s');
    expect(stats1.etaSeconds).toBeGreaterThan(0);

    // Second update exercises EMA smoothing
    const stats2 = calc.update(5 * 1024 * 1024, baseTime + 2000);
    expect(stats2.percentage).toBe(50);
    expect(stats2.speedBps).toBeGreaterThan(0);
  });
});
