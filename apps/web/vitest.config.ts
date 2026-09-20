import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The Svelte plugin compiles runes (`$state`, ...) in `*.svelte.ts` modules under test.
  plugins: [svelte()],
  test: { name: 'web' },
});
