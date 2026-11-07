import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Shared local Postgres: parallel DB suites race on refund/outbox workers' claim queries.
    fileParallelism: false,
  },
});
