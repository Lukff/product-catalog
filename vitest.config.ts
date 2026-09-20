import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One project per workspace package. `apps/web` has its own config (Svelte plugin).
    projects: ['apps/api', 'apps/web', 'packages/shared'],
  },
});
