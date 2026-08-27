import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // WEB-008 adds pure client-side modules (type re-inference, guard hints)
    // under src/lib — node environment suffices, they touch no DOM.
    include: ['server/**/*.test.ts', 'src/lib/**/*.test.ts'],
  },
});
