<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';

  function restart() {
    location.reload();
  }
</script>

<div id="game-over-modal" class:hidden={uiState.gameState !== 'GAME_OVER'}>
  <div class="modal-overlay"></div>

  <div class="game-over-content glass">
    <div class="header">
      <h2 class="title">FATAL ERROR</h2>
      <div class="subtitle">SYSTEM INTEGRITY COMPROMISED</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="label">FINAL LEVEL</span>
        <span class="value cyan">{uiState.level}</span>
      </div>
      <div class="stat-card">
        <span class="label">DATA RECOVERED</span>
        <span class="value pink">{uiState.score}</span>
      </div>
    </div>

    <button class="reboot-btn glow" onclick={restart}>
      <span class="btn-text">INITIATE REBOOT</span>
      <span class="btn-subtext">RESTORE SYSTEM STATE</span>
    </button>
  </div>
</div>

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
  }

  .hidden {
    display: none !important;
  }

  .modal-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(255, 0, 85, 0.1) 100%);
  }

  .game-over-content {
    width: min(90%, 450px);
    border-radius: 28px;
    padding: 4rem 2rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 3rem;
    text-align: center;
    border: 1px solid rgba(255, 0, 85, 0.1);
  }

  .title {
    font-family: var(--font-heading);
    font-size: 2.5rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    margin: 0;
    color: var(--color-secondary);
    text-shadow: 0 0 30px rgba(255, 0, 85, 0.4);
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
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.03);
    padding: 1.5rem;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-card .label {
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
  }

  .stat-card .value {
    font-family: var(--font-heading);
    font-size: 1.75rem;
    font-weight: 700;
  }

  .cyan {
    color: var(--color-primary);
  }
  .pink {
    color: var(--color-secondary);
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

  .reboot-btn:hover {
    transform: translateY(-4px);
    box-shadow: 0 0 40px rgba(255, 0, 85, 0.5);
    filter: brightness(1.1);
  }

  .reboot-btn .btn-text {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .reboot-btn .btn-subtext {
    font-size: 0.6rem;
    opacity: 0.8;
    letter-spacing: 0.1em;
  }
</style>
