<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { setGameState } from '../../core/GameState';

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

<div id="pause-modal" class:hidden={uiState.gameState !== 'PAUSED' || uiState.showSettings}>
  <div class="modal-overlay"></div>

  <div class="pause-content glass">
    <h2 class="title">SYSTEM PAUSED</h2>
    <div class="actions">
      <button class="action-btn primary" onclick={resume}>
        <span class="btn-text">RESUME</span>
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

<style>
  #pause-modal {
    position: fixed;
    inset: 0;
    z-index: 1500;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(10, 10, 18, 0.4);
    backdrop-filter: blur(8px);
  }

  .hidden {
    display: none !important;
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
    text-shadow: 0 0 20px rgba(45, 226, 230, 0.4);
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
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
  }

  .btn-text {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .action-btn.primary {
    background: var(--color-primary);
    color: #000;
    border: none;
  }

  .action-btn.primary:hover {
    box-shadow: 0 0 30px rgba(45, 226, 230, 0.4);
  }
</style>
