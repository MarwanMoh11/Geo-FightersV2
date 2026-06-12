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

  <!-- Top Bar: Timer and Boss Health -->
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

    <div class="timer-container glass">
      <span class="timer-text">{timerText}</span>
    </div>
  </div>

  <!-- Top Right: Score and Levels -->
  <div class="top-right">
    <button class="pause-btn glass" onclick={pauseGame} aria-label="Pause Game" title="Pause (ESC)">
      ⏸
    </button>
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
      <div class="divider"></div>
      <div class="stat-item">
        <span class="label">LVL</span>
        <span class="value pink">{uiState.level.toString().padStart(2, '0')}</span>
      </div>
    </div>
  </div>

  <!-- Bottom: Health and XP -->
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

    <!-- XP Bar (Edge to Edge at bottom) -->
    <div class="xp-container">
      <div class="xp-fill" class:level-flash={levelFlash} style="width: {xpPercent}%"></div>
      <div class="xp-label" class:level-flash={levelFlash}>
        {levelFlash ? 'LEVEL UP!' : `NEURAL SYNC: ${Math.floor(xpPercent)}%`}
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
    z-index: 50;
    font-family: var(--font-mono);
  }

  .hidden {
    display: none !important;
  }

  /* Utils */
  .cyan {
    color: var(--color-primary);
  }
  .pink {
    color: var(--color-secondary);
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
    top: 1.5rem;
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

  /* Top Right */
  .top-right {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .pause-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--color-text-main);
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s ease;
  }

  .pause-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.05);
  }

  .pause-btn:active {
    transform: scale(0.95);
  }

  .stat-group {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    border-radius: 12px;
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
  }

  .health-panel {
    width: min(100%, 300px);
    padding: 1rem;
    border-radius: 16px;
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

  /* XP Bar */
  .xp-container {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: rgba(0, 0, 0, 0.5);
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
    bottom: 8px;
    left: 1.5rem;
    font-size: 0.5rem;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
    text-transform: uppercase;
    transition: color 0.2s ease;
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

    .top-right {
      top: 1rem;
      right: 1rem;
    }

    .stat-group {
      padding: 0.5rem 0.75rem;
    }

    .health-panel {
      width: 100%;
    }

    .timer-container {
      padding: 0.25rem 1rem;
    }

    .timer-text {
      font-size: 1.25rem;
    }
  }
</style>
