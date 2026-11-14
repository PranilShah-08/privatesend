/**
 * Ephemeral Web Audio API feedback synthesizer.
 * Generates pleasant micro-interaction chimes in RAM with zero external audio assets.
 */

let cachedAudioCtx: AudioContext | null = null;

export function resetAudioContextForTesting(): void {
  cachedAudioCtx = null;
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!cachedAudioCtx || cachedAudioCtx.state === 'closed') {
    try {
      cachedAudioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return cachedAudioCtx;
}

export function playVerificationSuccessChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Harmonic two-tone chord: D5 (587.33 Hz) -> A5 (880 Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.08);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22); // D6 sparkle

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.12);

    osc2.onended = () => {
      try {
        gainNode.disconnect();
      } catch {}
    };

    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch {
    // Non-fatal: safely ignore autoplay or Web Audio policy rejections
  }
}

export function playErrorChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220.0, now);
    osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.25);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.onended = () => {
      try {
        gainNode.disconnect();
      } catch {}
    };

    osc.start(now);
    osc.stop(now + 0.28);
  } catch {
    // Non-fatal
  }
}
