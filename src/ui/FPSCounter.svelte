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
    fpsHistory.length > 0
      ? Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length)
      : 0,
  );

  const pointsString = $derived(
    fpsHistory
      .map((fps, i) => {
        const x = (i / (maxHistory - 1)) * 100;
        const clampedFps = Math.max(0, Math.min(90, fps));
        const y = 40 - (clampedFps / 90) * 35; // Leave 5px padding on top
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' '),
  );

  // --- Thermal governor readout ---
  // 0 means the governor does not apply here (desktop), so the whole row goes
  // away rather than showing a cap nothing is enforcing.
  const thermalActive = $derived(uiState.thermalCap > 0);

  const loadClock = $derived.by(() => {
    const s = uiState.thermalLoadSeconds;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  // Progress toward the next step down. Null on the bottom rung — there is no
  // next drop to count toward, so the bar fills and stops.
  const rungProgress = $derived.by(() => {
    const next = uiState.thermalNextRungAtS;
    if (next === null || next <= 0) return 1;
    return Math.max(0, Math.min(1, uiState.thermalLoadSeconds / next));
  });

  // Green while at the top rung, amber once stepped down, red at the floor.
  const thermalTone = $derived(
    uiState.thermalCap >= 60 ? 'ok' : uiState.thermalCap >= 45 ? 'warn' : 'hot',
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
        <line
          x1="0"
          y1="10"
          x2="100"
          y2="10"
          stroke="rgba(0, 255, 136, 0.15)"
          stroke-width="0.5"
          stroke-dasharray="2,2"
        />
        <line
          x1="0"
          y1="20"
          x2="100"
          y2="20"
          stroke="rgba(0, 255, 136, 0.15)"
          stroke-width="0.5"
          stroke-dasharray="2,2"
        />
        <line
          x1="0"
          y1="30"
          x2="100"
          y2="30"
          stroke="rgba(0, 255, 136, 0.15)"
          stroke-width="0.5"
          stroke-dasharray="2,2"
        />

        <!-- Plot line -->
        {#if pointsString}
          <polyline points={pointsString} fill="none" stroke="#00ff88" stroke-width="1.5" />
        {/if}
      </svg>
    </div>

    {#if thermalActive}
      <div class="thermal {thermalTone}">
        <div class="thermal-text">
          <span class="thermal-cap">CAP {uiState.thermalCap}</span>
          <span
            class="thermal-clock"
            title="Accumulated render time. Charges while drawing, discharges 2.5x faster while idle."
          >
            {loadClock}
          </span>
        </div>
        <div class="thermal-track">
          <div class="thermal-fill" style="transform: scaleX({rungProgress})"></div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .fps-container {
    position: fixed;
    left: calc(var(--safe-left) + 10px);
    bottom: calc(var(--safe-bottom) + 10px);
    width: 124px;
    padding: 7px;
    border-radius: var(--r-sm);
    border: 1px solid rgba(56, 245, 168, 0.22);
    background: var(--glass-bg-solid) !important;
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    gap: 5px;
    /* A readout with nothing to click. It used to claim pointer events anyway,
       which was survivable while it was two rows tall and sat below everything
       — but the thermal row pushed its top edge up into the main menu's "How
       to play" button, and an overlay that swallows taps on a real control is
       a bug even in a debug tool. Nothing in here is interactive, so let every
       tap fall through to whatever is underneath. */
    pointer-events: none;
    z-index: 9999;
    box-shadow: var(--glass-shadow);
  }

  .stats-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    letter-spacing: 0.05em;
  }

  .fps-value {
    color: var(--color-accent);
    font-weight: bold;
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

  /* ---- Thermal governor row ---- */
  .thermal {
    display: flex;
    flex-direction: column;
    gap: 3px;
    /* A rule rather than a gap: without it the cap reads as a third statistic
       about the graph above instead of a separate subsystem. */
    padding-top: 5px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .thermal-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 9px;
    letter-spacing: 0.05em;
  }

  .thermal-cap {
    font-weight: bold;
    color: var(--tone);
  }

  .thermal-clock {
    color: #888;
  }

  .thermal-track {
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  /* scaleX from a left origin: a transform is composited, so the bar can be
     driven every second without laying the overlay out again. */
  .thermal-fill {
    height: 100%;
    width: 100%;
    transform-origin: left center;
    background: var(--tone);
    transition: transform 0.4s linear;
  }

  .thermal.ok {
    --tone: #00ff88;
  }
  .thermal.warn {
    --tone: #ffb648;
  }
  .thermal.hot {
    --tone: #ff5d7a;
  }
</style>
