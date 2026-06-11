<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { setGameState } from '../../core/GameState';
  import { fade, scale } from 'svelte/transition';

  function resume() {
    setGameState('PLAYING');
  }

  function openSettings() {
    uiState.showSettings = true;
  }

  function backToMenu() {
    location.reload();
  }
</script>

{#if uiState.gameState === 'PAUSED' && !uiState.showSettings}
  <div id="pause-modal" transition:fade={{ duration: 200 }}>
    <div class="modal-overlay"></div>

    <div class="pause-content glass" transition:scale={{ duration: 250, start: 0.92 }}>
      <h2 class="title">SYSTEM PAUSED</h2>
      <div class="actions">
        <button class="action-btn primary" onclick={resume}>
          <span class="btn-text">RESUME</span>
          <span class="btn-hint">ESC</span>
        </button>
        <button class="action-btn" onclick={openSettings}>
          <span class="btn-text">SETTINGS</span>
        </button>
        <button class="action-btn" onclick={backToMenu}>
          <span class="btn-text">QUIT MISSION</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  #pause-modal {
    position: fixed;
    inset: 0;
    z-index: 1500;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(4, 4, 16, 0.4);
    backdrop-filter: blur(8px);
  }

  .modal-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.6) 100%);
  }

  .pause-content {
    width: min(90%, 350px);
    border-radius: 24px;
    padding: 3rem 2rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    margin: 0;
    color: var(--color-primary);
    text-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .action-btn {
    all: unset;
    cursor: pointer;
    padding: 1.25rem;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    transition: all var(--transition-fast);
    position: relative;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
  }

  .action-btn:active {
    transform: translateY(0) scale(0.98);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .btn-text {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .btn-hint {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    color: var(--color-text-dim);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    padding: 2px 6px;
  }

  .action-btn.primary {
    background: var(--color-primary);
    color: #000;
    border: none;
  }

  .action-btn.primary .btn-hint {
    color: rgba(0, 0, 0, 0.6);
    border-color: rgba(0, 0, 0, 0.3);
  }

  .action-btn.primary:hover {
    box-shadow: 0 0 30px rgba(0, 229, 255, 0.4);
  }
</style>
