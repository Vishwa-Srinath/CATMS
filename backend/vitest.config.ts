import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/app/index.ts'],  // entry point; tested via integration
    },
    // Run tests sequentially to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
