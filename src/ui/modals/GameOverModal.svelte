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
    background: rgba(15, 0, 5, 0.8);
    backdrop-filter: blur(15px);
    transition: opacity 0.25s ease;
    pointer-events: auto;
  }

  #game-over-modal.victory {
    background: rgba(0, 12, 8, 0.8);
  }

  #game-over-modal.leaving {
    opacity: 0;
  }

  .modal-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(255, 46, 136, 0.1) 100%);
  }

  .victory .modal-overlay {
    background: radial-gradient(circle at center, transparent 0%, rgba(0, 255, 136, 0.08) 100%);
  }

  .game-over-content {
    width: min(90%, 480px);
    border-radius: 28px;
    padding: 3.5rem 2rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
    text-align: center;
    border: 1px solid rgba(255, 46, 136, 0.1);
  }

  .victory .game-over-content {
    border-color: rgba(0, 255, 136, 0.15);
  }

  .title {
    font-family: var(--font-heading);
    font-size: 2.25rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    margin: 0;
    color: var(--color-secondary);
    text-shadow: 0 0 30px rgba(255, 46, 136, 0.4);
    animation: title-glitch 3s ease-in-out infinite;
  }

  .title.win {
    color: var(--color-accent);
    text-shadow: 0 0 30px rgba(0, 255, 136, 0.4);
    animation: none;
  }

  @keyframes title-glitch {
    0%,
    92%,
    100% {
      transform: translateX(0);
      opacity: 1;
    }
    94% {
      transform: translateX(-3px);
      opacity: 0.8;
    }
    96% {
      transform: translateX(2px);
      opacity: 1;
    }
  }

  .subtitle {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.3em;
    color: var(--color-text-dim);
    margin-top: 0.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.03);
    padding: 1.25rem 0.75rem;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-card .label {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
  }

  .stat-card .value {
    font-family: var(--font-heading);
    font-size: 1.5rem;
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
    text-shadow: 0 0 12px rgba(255, 225, 77, 0.4);
  }

  .reboot-btn {
    all: unset;
    cursor: pointer;
    padding: 1.5rem;
    border-radius: 16px;
    background: var(--color-secondary);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    transition: all var(--transition-smooth);
  }

  .victory .reboot-btn {
    background: var(--color-accent);
    color: #00170d;
  }

  .reboot-btn:hover {
    transform: translateY(-4px);
    box-shadow: 0 0 40px rgba(255, 46, 136, 0.5);
    filter: brightness(1.1);
  }

  .victory .reboot-btn:hover {
    box-shadow: 0 0 40px rgba(0, 255, 136, 0.5);
  }

  .reboot-btn:active {
    transform: translateY(-1px) scale(0.99);
  }

  .reboot-btn:focus-visible {
    outline: 2px solid var(--color-text-main);
    outline-offset: 3px;
  }

  .reboot-btn .btn-text {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .reboot-btn .btn-subtext {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    opacity: 0.8;
    letter-spacing: 0.1em;
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
