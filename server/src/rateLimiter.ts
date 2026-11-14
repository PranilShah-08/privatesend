export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export class SlidingRateLimiter {
  private attempts = new Map<string, number[]>();
  private lockouts = new Map<string, number>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;
  private pruneTimer?: NodeJS.Timeout;

  constructor(options: Partial<RateLimiterOptions> = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.windowMs = options.windowMs ?? 60_000; // 1 minute
    this.lockoutMs = options.lockoutMs ?? 300_000; // 5 minutes

    // Periodic sweep to prevent unbounded memory growth from scanners
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    if (this.pruneTimer.unref) {
      this.pruneTimer.unref();
    }
  }

  /**
   * Returns true if client is allowed to make an attempt, false if locked out
   */
  public check(ip: string): boolean {
    const now = Date.now();
    const lockedUntil = this.lockouts.get(ip);
    if (lockedUntil && now < lockedUntil) {
      return false;
    }

    // Clean up expired lockout
    if (lockedUntil) {
      this.lockouts.delete(ip);
      this.attempts.delete(ip);
    }

    // Filter attempts to current sliding window
    const timestamps = (this.attempts.get(ip) ?? []).filter(
      (ts) => now - ts < this.windowMs
    );
    this.attempts.set(ip, timestamps);

    return timestamps.length < this.maxAttempts;
  }

  /**
   * Records a failed attempt for the IP. Triggers lockout if maxAttempts reached.
   */
  public recordFailure(ip: string): void {
    const now = Date.now();
    const timestamps = (this.attempts.get(ip) ?? []).filter(
      (ts) => now - ts < this.windowMs
    );
    timestamps.push(now);
    this.attempts.set(ip, timestamps);

    if (timestamps.length >= this.maxAttempts) {
      this.lockouts.set(ip, now + this.lockoutMs);
    }
  }

  /**
   * Resets failures for an IP upon successful room code verification.
   */
  public recordSuccess(ip: string): void {
    this.attempts.delete(ip);
    this.lockouts.delete(ip);
  }

  /**
   * Prunes inactive IP entries to prevent memory leaks
   */
  public prune(): void {
    const now = Date.now();
    for (const [ip, tsList] of this.attempts.entries()) {
      const active = tsList.filter((ts) => now - ts < this.windowMs);
      if (active.length === 0 && !this.lockouts.has(ip)) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, active);
      }
    }
    for (const [ip, lockedUntil] of this.lockouts.entries()) {
      if (now >= lockedUntil) {
        this.lockouts.delete(ip);
      }
    }
  }

  public destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }
  }
}
