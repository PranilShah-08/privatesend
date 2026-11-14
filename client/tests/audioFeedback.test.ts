import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playVerificationSuccessChime,
  playErrorChime,
  getAudioContext,
  resetAudioContextForTesting,
} from '../src/services/audioFeedbackService.js';

describe('AudioFeedbackService', () => {
  let mockAudioContext: any;

  beforeEach(() => {
    resetAudioContextForTesting();
    mockAudioContext = {
      state: 'running',
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn().mockReturnValue({
        type: 'sine',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
      destination: {},
    };

    (global as any).window = {
      AudioContext: vi.fn().mockImplementation(() => mockAudioContext),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).window;
  });

  it('initializes and returns AudioContext in browser environments', () => {
    const ctx = getAudioContext();
    expect(ctx).toBeDefined();
    expect(ctx).toBe(mockAudioContext);
  });

  it('safely plays verification success chime without throwing', () => {
    expect(() => playVerificationSuccessChime()).not.toThrow();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
  });

  it('resumes suspended audio context automatically', () => {
    mockAudioContext.state = 'suspended';
    playVerificationSuccessChime();
    expect(mockAudioContext.resume).toHaveBeenCalled();
  });

  it('safely plays error chime without throwing', () => {
    expect(() => playErrorChime()).not.toThrow();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });

  it('gracefully handles headless / SSR environment without AudioContext', () => {
    delete (global as any).window;
    expect(() => playVerificationSuccessChime()).not.toThrow();
    expect(() => playErrorChime()).not.toThrow();
  });
});
