<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { untrack } from 'svelte';

  const maxHistory = 80;
  let fpsHistory = $state<number[]>([]);

  // Reactively track uiState.fps, but untrack history updates to avoid infinite loops
  $effect(() => {
    const currentFps = uiState.fps;
    untrack(() => {
      fpsHistory = [...fpsHistory, currentFps].slice(-maxHistory);
    });
  });

  // Derived stats
  const averageFps = $derived(
    fpsHistory.length > 0 ? Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length) : 0
  );

  const pointsString = $derived(
    fpsHistory
      .map((fps, i) => {
        const x = (i / (maxHistory - 1)) * 100;
        const clampedFps = Math.max(0, Math.min(90, fps));
        const y = 40 - (clampedFps / 90) * 35; // Leave 5px padding on top
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ')
  );
</script>

{#if uiState.showFps}
  <div class="fps-container glass">
    <div class="stats-text">
      <span class="fps-value">{uiState.fps} FPS</span>
      <span class="avg-label">AVG: {averageFps}</span>
    </div>
    <div class="graph-wrapper">
      <svg class="graph-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
        <!-- Grid lines -->
        <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(0, 255, 136, 0.15)" stroke-width="0.5" stroke-dasharray="2,2" />
        <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(0, 255, 136, 0.15)" stroke-width="0.5" stroke-dasharray="2,2" />
        <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(0, 255, 136, 0.15)" stroke-width="0.5" stroke-dasharray="2,2" />
        
        <!-- Plot line -->
        {#if pointsString}
          <polyline points={pointsString} fill="none" stroke="#00ff88" stroke-width="1.5" />
        {/if}
      </svg>
    </div>
  </div>
{/if}

<style>
  .fps-container {
    position: fixed;
    top: 15px;
    right: 15px;
    width: 140px;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(0, 255, 136, 0.25);
    background: rgba(10, 10, 18, 0.8) !important;
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: auto;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 255, 136, 0.1);
  }

  .stats-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    letter-spacing: 0.05em;
  }

  .fps-value {
    color: #00ff88;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(0, 255, 136, 0.5);
  }

  .avg-label {
    color: #888;
  }

  .graph-wrapper {
    height: 30px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .graph-svg {
    width: 100%;
    height: 100%;
  }
</style>
