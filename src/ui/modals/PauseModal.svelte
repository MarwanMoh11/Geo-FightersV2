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
  <div id="pause-modal" transition:fade={{ duration: 180 }}>
    <div class="sheet glass" transition:scale={{ duration: 240, start: 0.94 }}>
      <h2 class="title">Paused</h2>
      <div class="actions">
        <button class="action-btn primary" onclick={resume}>
          <span class="btn-text">Resume</span>
          <span class="btn-hint">ESC</span>
        </button>
        <button class="action-btn" onclick={openSettings}>
          <span class="btn-text">Settings</span>
        </button>
        <button class="action-btn danger" onclick={backToMenu}>
          <span class="btn-text">Quit run</span>
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
    background: rgba(4, 6, 15, 0.55);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    pointer-events: auto;
  }

  .sheet {
    width: 100%;
    max-width: 320px;
    border-radius: var(--r-xl);
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    color: var(--color-text-main);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .action-btn {
    all: unset;
    cursor: pointer;
    padding: 1rem;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
    position: relative;
  }
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .action-btn:active {
    transform: scale(0.985);
  }

  .btn-text {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-text-main);
  }

  .btn-hint {
    position: absolute;
    right: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    color: rgba(4, 6, 15, 0.55);
    border: 1px solid rgba(4, 6, 15, 0.25);
    border-radius: 4px;
    padding: 2px 6px;
  }

  .action-btn.primary {
    background: var(--color-primary);
    border-color: transparent;
  }
  .action-btn.primary .btn-text {
    color: #04060f;
  }
  .action-btn.primary:hover {
    filter: brightness(1.08);
  }

  .action-btn.danger .btn-text {
    color: var(--color-text-dim);
  }
  .action-btn.danger:hover {
    border-color: rgba(255, 61, 119, 0.4);
  }
</style>
