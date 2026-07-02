import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  // Relative base so the built game runs from any subpath — required for web
  // game portals (CrazyGames, itch.io, GameDistribution…) that host uploads
  // under nested URLs. Root-hosted deploys (Netlify/Render) are unaffected.
  base: './',
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'esnext',
    // Split the heavyweight vendors into parallel-loadable chunks so the
    // loading bar moves sooner on portal embeds.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@dimforge')) return 'rapier';
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('socket.io')) return 'net';
        },
      },
    },
  },
});
