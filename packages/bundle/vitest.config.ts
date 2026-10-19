import { defineConfig } from 'vitest/config';

// the tests read the sources and the groups; they never build (`vite.config.ts` is the build's, not theirs)
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
