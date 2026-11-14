import type { TransferProgressStats } from '../../../shared/types.js';

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = (bytes / Math.pow(k, i)).toFixed(dm);
  return `${val} ${sizes[i]}`;
}

export function formatTime(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export class SpeedCalculator {
  private lastTime = 0;
  private lastBytes = 0;
  private totalBytes = 0;
  private smoothedSpeed = 0;
  private readonly alpha = 0.3; // EWMA smoothing factor

  public start(totalBytes: number, explicitNow?: number): void {
    const now = explicitNow ?? Date.now();
    this.lastTime = now;
    this.lastBytes = 0;
    this.totalBytes = totalBytes;
    this.smoothedSpeed = 0;
  }

  public update(currentBytes: number, explicitNow?: number): TransferProgressStats {
    const now = explicitNow ?? Date.now();
    const timeDelta = (now - this.lastTime) / 1000;

    if (timeDelta > 0.05) {
      const bytesDelta = currentBytes - this.lastBytes;
      const instantSpeed = bytesDelta / timeDelta;

      if (this.smoothedSpeed === 0) {
        this.smoothedSpeed = instantSpeed;
      } else {
        this.smoothedSpeed = this.alpha * instantSpeed + (1 - this.alpha) * this.smoothedSpeed;
      }

      this.lastTime = now;
      this.lastBytes = currentBytes;
    }

    const remainingBytes = Math.max(0, this.totalBytes - currentBytes);
    const etaSeconds = this.smoothedSpeed > 0 ? Math.ceil(remainingBytes / this.smoothedSpeed) : 0;
    const percentage = this.totalBytes > 0 ? Math.min(100, (currentBytes / this.totalBytes) * 100) : 0;

    return {
      bytesTransferred: currentBytes,
      totalBytes: this.totalBytes,
      percentage: Number(percentage.toFixed(1)),
      speedBps: Math.round(this.smoothedSpeed),
      speedFormatted: `${formatBytes(this.smoothedSpeed)}/s`,
      etaSeconds,
      etaFormatted: formatTime(etaSeconds),
    };
  }
}
