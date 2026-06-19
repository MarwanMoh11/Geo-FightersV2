<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { fly } from 'svelte/transition';

  // Derived values
  let hpPercent = $derived(
    Math.max(0, Math.min(100, (uiState.health.current / uiState.health.max) * 100)),
  );
  let xpPercent = $derived((uiState.xp / uiState.xpMax) * 100);
  let lowHealth = $derived(hpPercent <= 30);

  let minutes = $derived(
    Math.floor(uiState.gameTime / 60)
      .toString()
      .padStart(2, '0'),
  );
  let seconds = $derived(
    Math.floor(uiState.gameTime % 60)
      .toString()
      .padStart(2, '0'),
  );
  let timerText = $derived(`${minutes}:${seconds}`);

  function pauseGame() {
    // Route through the state machine so the game loop actually halts
    setGameState('PAUSED');
  }

  // (The damage vignette re-mounts via {#key} each hit, restarting its animation)

  // Flash the XP bar gold when a level-up happens
  let levelFlash = $state(false);
  let lastLevel = 1;
  $effect(() => {
    if (uiState.level > lastLevel) {
      levelFlash = true;
      setTimeout(() => (levelFlash = false), 900);
    }
    lastLevel = uiState.level;
  });
</script>

<div id="hud-overlay" class:hidden={uiState.gameState !== 'PLAYING'}>
  <!-- Damage feedback vignette (re-keyed per hit so the flash always restarts) -->
  {#key uiState.damageFlash}
    <div class="damage-vignette" class:low={lowHealth} class:flash={uiState.damageFlash > 0}></div>
  {/key}

  <!-- Top Edge: XP Bar -->
  <div class="xp-container">
    <div class="xp-fill" class:level-flash={levelFlash} style="width: {xpPercent}%"></div>
    <div class="xp-label" class:level-flash={levelFlash}>
      {levelFlash
        ? 'LEVEL UP!'
        : `SYSTEM LVL ${uiState.level.toString().padStart(2, '0')} • SYNC ${Math.floor(xpPercent)}%`}
    </div>
  </div>

  <!-- Top Center: Boss Health -->
  <div class="top-center">
    {#if uiState.bossHealth.active}
      <div class="boss-health glass" transition:fly={{ y: -24, duration: 400 }}>
        <div class="boss-label">⚠ SYSTEM CORRUPTION ⚠</div>
        <div class="boss-bar">
          <div
            class="boss-fill"
            style="width: {(uiState.bossHealth.current / uiState.bossHealth.max) * 100}%"
          ></div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Top Left: Minimap (Radar) -->
  <div id="minimap-container" class="glass">
    <canvas id="minimap-canvas" width="150" height="150"></canvas>
    <div id="minimap-label">RADAR</div>
  </div>

  <!-- Center Timer (Vertically aligned with minimap) -->
  <div class="timer-container glass top-left-timer">
    <span class="timer-text">{timerText}</span>
  </div>

  <!-- Top Right: Pause button container -->
  <div class="top-right-actions">
    <button class="pause-btn glass" onclick={pauseGame} aria-label="Pause Game" title="Pause (ESC)">
      ⏸
    </button>
  </div>

  <!-- Stats Panel container -->
  <div class="stats-panel-container">
    <div class="stat-group glass">
      <div class="stat-item">
        <span class="label">DATA</span>
        <span class="value cyan">{uiState.score}</span>
      </div>
      <div class="divider"></div>
      <div class="stat-item">
        <span class="label">KILLS</span>
        <span class="value gold">{uiState.kills}</span>
      </div>
    </div>
  </div>

  <!-- Bottom: Health and status panels -->
  <div class="bottom-container">
    <div class="status-panels">
      <!-- Health Panel -->
      <div class="health-panel glass">
        <div class="panel-header">
          <span class="label">INTEGRITY</span>
          <span class="value" class:danger={lowHealth}>{Math.ceil(hpPercent)}%</span>
        </div>
        <div class="gauge-container">
          <div class="gauge-fill health" class:low={lowHealth} style="width: {hpPercent}%"></div>
          <div class="gauge-segments">
            {#each Array(10) as _}
              <div class="segment"></div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  #hud-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.5rem;
    z-index: 120;
    font-family: var(--font-mono);
  }

  .hidden {
    display: none !important;
  }

  /* Utils */
  .cyan {
    color: var(--color-primary);
  }
  .gold {
    color: var(--color-gold);
  }

  /* Damage vignette: flashes red on hit, simmers when health is low */
  .damage-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(ellipse at center, transparent 55%, rgba(255, 30, 70, 0.55) 100%);
  }

  .damage-vignette.low {
    opacity: 0.35;
    animation: low-pulse 1.4s ease-in-out infinite;
  }

  .damage-vignette.flash {
    animation: vignette-flash 0.45s ease-out;
  }

  .damage-vignette.flash.low {
    animation:
      vignette-flash 0.45s ease-out,
      low-pulse 1.4s ease-in-out 0.45s infinite;
  }

  @keyframes vignette-flash {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes low-pulse {
    50% {
      opacity: 0.15;
    }
  }

  /* Top Bar */
  .top-center {
    position: absolute;
    top: 4.5rem; /* adjusted down to prevent overlapping with XP label */
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: min(90%, 400px);
  }

  .timer-container {
    padding: 0.5rem 1.5rem;
    border-radius: 99px;
  }

  .top-left-timer {
    position: absolute;
    top: 32px;
    left: 50%;
    transform: translateX(-50%);
  }

  :global(body.inverted-controls) .top-left-timer {
    left: 50%;
    transform: translateX(-50%);
    right: auto;
  }

  .timer-text {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--color-text-main);
  }

  .boss-health {
    width: 100%;
    padding: 0.75rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 46, 136, 0.35);
  }

  .boss-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: var(--color-secondary);
    margin-bottom: 0.5rem;
    text-align: center;
    animation: boss-label-pulse 1.2s ease-in-out infinite;
  }

  @keyframes boss-label-pulse {
    50% {
      opacity: 0.6;
    }
  }

  .boss-bar {
    height: 6px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    overflow: hidden;
  }

  .boss-fill {
    height: 100%;
    background: var(--color-secondary);
    box-shadow: 0 0 10px var(--color-secondary);
    transition: width 0.3s ease;
  }

  /* Top Right Action (Pause Button) */
  .top-right-actions {
    position: absolute;
    top: 15px;
    right: 15px;
    z-index: 130;
    pointer-events: none;
  }

  :global(body.inverted-controls) .top-right-actions {
    right: auto;
    left: 15px;
  }

  .pause-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--color-text-main);
    cursor: pointer;
    font-size: 1.1rem;
    transition: all 0.2s ease;
    pointer-events: auto !important;
  }

  .pause-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.05);
  }

  .pause-btn:active {
    transform: scale(0.95);
  }

  /* Stats Panel Container */
  .stats-panel-container {
    position: absolute;
    top: 15px;
    right: 75px; /* sit next to pause button on desktop */
    z-index: 120;
    pointer-events: none;
  }

  :global(body.inverted-controls) .stats-panel-container {
    right: auto;
    left: 75px;
  }

  .stat-group {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    border-radius: 12px;
    pointer-events: auto !important;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .stat-item .label {
    font-size: 0.5rem;
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
  }

  .stat-item .value {
    font-size: 1.1rem;
    font-weight: 700;
  }

  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Bottom Area */
  .bottom-container {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    pointer-events: none;
  }

  .health-panel {
    width: min(100%, 300px);
    padding: 1rem;
    border-radius: 16px;
    pointer-events: auto !important;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 0.5rem;
  }

  .panel-header .label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
  }

  .panel-header .value {
    font-size: 0.9rem;
    font-weight: 700;
    transition: color 0.3s ease;
  }

  .panel-header .value.danger {
    color: var(--color-secondary);
    text-shadow: 0 0 8px rgba(255, 46, 136, 0.7);
  }

  .gauge-container {
    height: 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }

  .gauge-fill {
    height: 100%;
    transition: width 0.2s ease;
  }

  .gauge-fill.health {
    background: linear-gradient(90deg, var(--color-primary), #6ff2ff);
    box-shadow: 0 0 15px rgba(0, 229, 255, 0.3);
  }

  .gauge-fill.health.low {
    background: linear-gradient(90deg, var(--color-secondary), #ff4d8d);
    box-shadow: 0 0 15px rgba(255, 0, 85, 0.5);
    animation: gauge-pulse 0.9s ease-in-out infinite;
  }

  @keyframes gauge-pulse {
    50% {
      opacity: 0.6;
    }
  }

  .gauge-segments {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: space-between;
    padding: 0 2px;
  }

  .segment {
    width: 1px;
    height: 100%;
    background: rgba(255, 255, 255, 0.1);
  }

  /* XP Bar (Edge to Edge at top) */
  .xp-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    pointer-events: none;
  }

  .xp-fill {
    height: 100%;
    background: var(--color-primary);
    box-shadow: 0 0 10px var(--color-primary);
    transition: width 0.3s ease;
  }

  .xp-fill.level-flash {
    background: var(--color-gold);
    box-shadow: 0 0 18px var(--color-gold);
  }

  .xp-label {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
    text-transform: uppercase;
    transition: color 0.2s ease;
    white-space: nowrap;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  }

  .xp-label.level-flash {
    color: var(--color-gold);
    text-shadow: 0 0 10px var(--color-gold);
    font-weight: 700;
  }

  /* Mobile Adjustments */
  @media (max-width: 600px) {
    #hud-overlay {
      padding: 1rem;
    }

    .top-right-actions {
      top: 15px;
      right: 15px;
    }

    .pause-btn {
      width: 48px;
      height: 48px;
      font-size: 1.25rem;
      border-radius: 12px;
    }

    .stats-panel-container {
      top: 75px; /* sit vertically below pause button on mobile */
      right: 15px;
    }

    :global(body.inverted-controls) .stats-panel-container {
      right: auto;
      left: 15px;
    }

    .stat-group {
      padding: 0.4rem 0.6rem;
      gap: 0.5rem;
      border-radius: 8px;
    }

    .stat-item .value {
      font-size: 0.8rem;
    }

    .stat-item .label {
      font-size: 0.45rem;
    }

    .health-panel {
      position: fixed;
      bottom: 110px; /* sit above centered inventory */
      left: 50%;
      transform: translateX(-50%);
      width: min(90vw, 220px);
      padding: 0.6rem 0.8rem;
      border-radius: 12px;
    }

    :global(body.inverted-controls) .health-panel {
      left: 50%;
      transform: translateX(-50%);
      right: auto;
    }

    .timer-container {
      padding: 0.25rem 1rem;
    }

    .timer-text {
      font-size: 1.25rem;
    }

    .top-left-timer {
      top: 32px;
      left: 50%;
      transform: translateX(-50%);
    }

    :global(body.inverted-controls) .top-left-timer {
      left: 50%;
      transform: translateX(-50%);
      right: auto;
    }
  }
</style>
