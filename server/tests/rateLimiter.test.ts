import { describe, it, expect, beforeEach } from 'vitest';
import { SlidingRateLimiter } from '../src/rateLimiter.js';

describe('SlidingRateLimiter', () => {
  let limiter: SlidingRateLimiter;

  beforeEach(() => {
    limiter = new SlidingRateLimiter({
      maxAttempts: 3,
      windowMs: 1000,
      lockoutMs: 2000,
    });
  });

  it('allows attempts within the threshold', () => {
    const ip = '127.0.0.1';
    expect(limiter.check(ip)).toBe(true);
    limiter.recordFailure(ip);
    expect(limiter.check(ip)).toBe(true);
    limiter.recordFailure(ip);
    expect(limiter.check(ip)).toBe(true);
  });

  it('locks out when attempts exceed maxAttempts', () => {
    const ip = '127.0.0.1';
    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    // Now maxAttempts reached
    expect(limiter.check(ip)).toBe(false);
  });

  it('clears failures on success', () => {
    const ip = '127.0.0.1';
    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    limiter.recordSuccess(ip);
    expect(limiter.check(ip)).toBe(true);
  });
});
