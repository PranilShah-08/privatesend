export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  roomTtlMs: 10 * 60 * 1000, // 10 minutes
  pruneIntervalMs: 60 * 1000, // 1 minute
  rateLimit: {
    maxAttempts: 5,
    windowMs: 60 * 1000,
    lockoutMs: 5 * 60 * 1000,
  },
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};
