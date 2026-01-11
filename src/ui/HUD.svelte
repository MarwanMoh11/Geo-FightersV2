<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';

  // Derived values
  let hpPercent = $derived((uiState.health.current / uiState.health.max) * 100);
  let xpPercent = $derived((uiState.xp / uiState.xpMax) * 100);

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
</script>

<div id="hud-overlay" class:hidden={uiState.gameState !== 'PLAYING'}>
  <!-- Top Bar: Timer and Boss Health -->
  <div class="top-center">
    {#if uiState.bossHealth.active}
      <div class="boss-health glass">
        <div class="boss-label">SYSTEM CORRUPTION</div>
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
    <button
      class="pause-btn glass"
      onclick={() => (uiState.isPaused = true)}
      aria-label="Pause Game"
    >
      ⏸
    </button>
    <div class="stat-group glass">
      <div class="stat-item">
        <span class="label">DATA</span>
        <span class="value cyan">{uiState.score}</span>
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
          <span class="value">{Math.ceil(Math.max(0, uiState.health.current))}%</span>
        </div>
        <div class="gauge-container">
          <div class="gauge-fill health" style="width: {hpPercent}%"></div>
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
      <div class="xp-fill" style="width: {xpPercent}%"></div>
      <div class="xp-label">NEURAL SYNC: {Math.floor(xpPercent)}%</div>
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
  }

  .boss-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: var(--color-secondary);
    margin-bottom: 0.5rem;
    text-align: center;
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
    background: linear-gradient(90deg, var(--color-secondary), #ff4d8d);
    box-shadow: 0 0 15px rgba(255, 0, 85, 0.3);
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

  .xp-label {
    position: absolute;
    bottom: 8px;
    left: 1.5rem;
    font-size: 0.5rem;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
    text-transform: uppercase;
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
