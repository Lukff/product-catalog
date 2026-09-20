import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: {
    port: 5173,
    // The API runs on :3000 in development; proxying keeps the browser same-origin, so no CORS.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
