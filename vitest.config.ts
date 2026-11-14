import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'server/src/utils/**',
        'server/src/rateLimiter.ts',
        'server/src/roomManager.ts',
        'server/src/signalingHandler.ts',
        'client/src/services/chunkerService.ts',
        'client/src/services/speedCalculator.ts',
        'client/src/utils/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
