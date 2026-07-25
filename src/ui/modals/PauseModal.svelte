<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { setGameState } from '../../core/GameState';
  import { resetRun } from '../../core/runReset';
  import { playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import Modal from '../Modal.svelte';

  /* Quitting a run throws away progress, so it asks once. On a phone the
     Quit row sits a thumb-width from Resume — a mis-tap used to end the run
     outright with no way back. */
  let confirmQuit = $state(false);

  function resume() {
    setGameState('PLAYING');
  }

  function openSettings() {
    playMenuClick();
    uiState.showSettings = true;
  }

  function openGrimoire() {
    playMenuClick();
    uiState.showGrimoire = true;
  }

  function openHowTo() {
    playMenuClick();
    uiState.showHowTo = true;
  }

  function backToMenu() {
    haptics.select();
    resetRun(); // abandon the run in place — no page reload
  }

  let open = $derived(
    uiState.gameState === 'PAUSED' &&
      !uiState.showSettings &&
      !uiState.showGrimoire &&
      !uiState.showHowTo,
  );

  $effect(() => {
    if (!open) confirmQuit = false;
  });

  let timeText = $derived(
    `${Math.floor(uiState.gameTime / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(uiState.gameTime % 60)
      .toString()
      .padStart(2, '0')}`,
  );
</script>

<Modal
  {open}
  eyebrow="Run paused"
  title="Paused"
  size="sm"
  tone="cyan"
  backdropClose
  onclose={resume}
>
  <!-- A pause screen is the natural place to check how the run is going,
       so the numbers come to you instead of squinting at the frozen HUD. -->
  <div class="run-stats">
    <div class="stat">
      <span class="stat-val tnum">{timeText}</span>
      <span class="stat-key">Time</span>
    </div>
    <div class="stat">
      <span class="stat-val tnum">{uiState.level}</span>
      <span class="stat-key">Level</span>
    </div>
    <div class="stat">
      <span class="stat-val tnum">{uiState.kills}</span>
      <span class="stat-key">Kills</span>
    </div>
    <div class="stat">
      <span class="stat-val tnum">×{uiState.bestCombo}</span>
      <span class="stat-key">Best combo</span>
    </div>
  </div>

  <div class="actions">
    <button class="ui-btn block" onclick={openGrimoire}>
      <span aria-hidden="true">📖</span> Evolutions
    </button>
    <button class="ui-btn block" onclick={openHowTo}>
      <span aria-hidden="true">❔</span> How to play
    </button>
    <button class="ui-btn block" onclick={openSettings}>
      <span aria-hidden="true">⚙️</span> Settings
    </button>

    {#if confirmQuit}
      <div class="confirm">
        <p class="confirm-text">Quit now and this run's progress is lost.</p>
        <div class="confirm-row">
          <button class="ui-btn ghost" onclick={() => (confirmQuit = false)}>Keep playing</button>
          <button class="ui-btn danger" onclick={backToMenu}>Quit run</button>
        </div>
      </div>
    {:else}
      <button
        class="ui-btn block quiet"
        onclick={() => {
          playMenuClick();
          confirmQuit = true;
        }}>Quit run</button
      >
    {/if}
  </div>

  {#snippet footer()}
    <button class="ui-btn primary lg" onclick={resume}>
      Resume <kbd class="kbd pointer-only">ESC</kbd>
    </button>
  {/snippet}
</Modal>

<style>
  .run-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
    margin-bottom: var(--sp-4);
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.55rem 0.25rem;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    min-width: 0;
  }
  .stat-val {
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .stat-key {
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    text-align: center;
    line-height: 1.2;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem;
    border-radius: var(--r-md);
    border: 1px solid rgba(255, 61, 119, 0.35);
    background: rgba(255, 61, 119, 0.07);
  }
  .confirm-text {
    margin: 0;
    font-size: var(--fs-caption);
    line-height: 1.4;
    color: var(--color-text-dim);
    text-align: center;
  }
  .confirm-row {
    display: flex;
    gap: 0.5rem;
  }
  .confirm-row .ui-btn {
    flex: 1;
  }
</style>
