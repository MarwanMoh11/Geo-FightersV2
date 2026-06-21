<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { fade, fly } from 'svelte/transition';

  let leaving = $state(false);

  function restart() {
    // Brief fade-out before the hard reset so the click feels acknowledged
    leaving = true;
    setTimeout(() => location.reload(), 250);
  }

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
</script>

{#if uiState.gameState === 'GAME_OVER'}
  <div
    id="game-over-modal"
    class:victory={uiState.isVictory}
    class:leaving
    transition:fade={{ duration: 600 }}
  >
    <div class="modal-overlay"></div>

    <div class="game-over-content glass" in:fly={{ y: 40, duration: 600, delay: 250 }}>
      <div class="header">
        {#if uiState.isVictory}
          <h2 class="title win">CORRUPTION PURGED</h2>
          <div class="subtitle">YOU SURVIVED THE SYSTEM</div>
        {:else}
          <h2 class="title">FATAL ERROR</h2>
          <div class="subtitle">SYSTEM INTEGRITY COMPROMISED</div>
        {/if}
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="label">TIME SURVIVED</span>
          <span class="value gold">{minutes}:{seconds}</span>
        </div>
        <div class="stat-card">
          <span class="label">FINAL LEVEL</span>
          <span class="value cyan">{uiState.level}</span>
        </div>
        <div class="stat-card">
          <span class="label">THREATS PURGED</span>
          <span class="value cyan">{uiState.kills}</span>
        </div>
        <div class="stat-card">
          <span class="label">DATA RECOVERED</span>
          <span class="value pink">{uiState.score}</span>
        </div>
      </div>

      <button class="reboot-btn" onclick={restart}>
        <span class="btn-text">{uiState.isVictory ? 'RUN IT BACK' : 'INITIATE REBOOT'}</span>
        <span class="btn-subtext">RESTORE SYSTEM STATE</span>
      </button>
    </div>
  </div>
{/if}

<style>
  #game-over-modal {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(8, 4, 8, 0.7);
    backdrop-filter: blur(14px);
    transition: opacity 0.25s ease;
    padding: 1.5rem;
    pointer-events: auto;
  }

  #game-over-modal.victory {
    background: rgba(4, 10, 8, 0.7);
  }

  #game-over-modal.leaving {
    opacity: 0;
  }

  .modal-overlay {
    display: none;
  }

  .game-over-content {
    width: 100%;
    max-width: 360px;
    border-radius: var(--r-xl);
    padding: 2.25rem 1.5rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: var(--color-secondary);
  }
  .title.win {
    color: var(--color-accent);
  }

  .subtitle {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    margin-top: 0.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.035);
    padding: 0.9rem 0.5rem;
    border-radius: var(--r-md);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .stat-card .label {
    font-size: 0.5rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }

  .stat-card .value {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 1.3rem;
    font-weight: 700;
  }

  .cyan {
    color: var(--color-primary);
  }
  .pink {
    color: var(--color-secondary);
  }
  .gold {
    color: var(--color-gold);
  }

  .reboot-btn {
    all: unset;
    cursor: pointer;
    padding: 1.1rem;
    border-radius: var(--r-md);
    background: var(--color-secondary);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    transition: all var(--transition-fast);
  }
  .victory .reboot-btn {
    background: var(--color-accent);
    color: #04130d;
  }
  .reboot-btn:hover {
    filter: brightness(1.08);
  }
  .reboot-btn:active {
    transform: scale(0.985);
  }
  .reboot-btn .btn-text {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .reboot-btn .btn-subtext {
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.7;
  }
</style>
