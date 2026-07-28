import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

/**
 * Stamp a unique id into the service worker's CACHE_VERSION at build time.
 *
 * sw.js lives in public/ and is copied verbatim, so it cannot use `define` or
 * import anything — the only seam is rewriting the emitted file. Without this
 * the cache namespace is a constant, the activate handler's purge (which only
 * deletes caches whose name differs) never fires, and old entries pile up
 * forever while stable-URL assets serve stale for a session after each deploy.
 *
 * Runs on `writeBundle`, after Vite has copied public/ into outDir. A no-op if
 * the placeholder is absent, so editing sw.js by hand can never break a build.
 */
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-sw',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const swPath = resolve(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      const source = readFileSync(swPath, 'utf-8');
      if (!source.includes('__BUILD_ID__')) return;
      // Version plus build time: the version alone would not change between
      // two deploys of the same version, which is exactly how iteration works.
      const buildId = `${pkg.version}-${Date.now().toString(36)}`;
      writeFileSync(swPath, source.replaceAll('__BUILD_ID__', buildId));
      console.log(`[stamp-sw] CACHE_VERSION = geofighters-${buildId}`);
    },
  };
}

export default defineConfig({
  // Relative base so the built game runs from any subpath — required for web
  // game portals (CrazyGames, itch.io, GameDistribution…) that host uploads
  // under nested URLs. Root-hosted deploys (Netlify/Render) are unaffected.
  base: './',
  plugins: [svelte(), stampServiceWorker()],
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
          // Keep WebGPU modules in their own chunk so they are only downloaded
          // + evaluated when dynamic import('three/webgpu') is actually reached.
          // Bundling them into the three chunk makes WebGPU init code run at
          // load time — crashes portal iframes (GPUShaderStage undefined).
          if (
            id.includes('three.webgpu') ||
            id.includes('three.tsl') ||
            id.includes('three.webgpu.nodes') ||
            id.includes('examples/jsm/tsl')
          )
            return 'webgpu';
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('socket.io')) return 'net';
        },
      },
    },
  },
});
