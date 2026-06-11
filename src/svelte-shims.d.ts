declare module '*.svelte' {
  import type { ComponentType } from 'svelte';
  const component: ComponentType;
  export default component;
}

/** App version injected at build time (see vite.config.ts `define`). */
declare const __APP_VERSION__: string;
