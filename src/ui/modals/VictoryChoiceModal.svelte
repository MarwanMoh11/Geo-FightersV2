<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { resolveVictoryChoice } from '../../systems/GameManager';
  import { playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import { fade, fly } from 'svelte/transition';

  function choose(stay: boolean) {
    playMenuClick();
    haptics.select();
    resolveVictoryChoice(stay);
  }
</script>

{#if uiState.showVictoryChoice}
  <div id="victory-choice" transition:fade={{ duration: 250 }}>
    <div class="content glass" in:fly={{ y: 30, duration: 450, delay: 150 }}>
      <h2 class="title">CORRUPTION PURGED</h2>
      <p class="subtitle">The system is clean… but the signal keeps growing.</p>

      <div class="choices">
        <button class="choice stay" onclick={() => choose(true)}>
          <span class="choice-label">STAY IN THE SYSTEM</span>
          <span class="choice-sub">Endless mode — how long can you last?</span>
        </button>
        <button class="choice extract" onclick={() => choose(false)}>
          <span class="choice-label">EXTRACT</span>
          <span class="choice-sub">Bank the victory</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  #victory-choice {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    justify-content: center;
    align-items: center;
    background:
      radial-gradient(ellipse 70% 60% at 50% 30%, rgba(60, 255, 170, 0.1), transparent 70%),
      rgba(4, 10, 8, 0.82);
    backdrop-filter: blur(12px);
    padding: 1.5rem;
    pointer-events: auto;
  }

  .content {
    width: 100%;
    max-width: 380px;
    border-radius: var(--r-xl);
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    color: #3cffaa;
    text-shadow: 0 0 18px rgba(60, 255, 170, 0.4);
  }

  .subtitle {
    font-size: 0.72rem;
    color: var(--color-text-dim);
    margin: 0;
    line-height: 1.5;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .choice {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.95rem 1.1rem;
    border-radius: var(--r-md);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
  }

  .choice:hover,
  .choice:focus-visible {
    background: rgba(255, 255, 255, 0.05);
  }

  .choice.stay {
    border-color: #3cffaa;
    background: rgba(60, 255, 170, 0.08);
  }

  .choice-label {
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--color-text-main);
  }

  .choice.stay .choice-label {
    color: #3cffaa;
  }

  .choice-sub {
    font-size: 0.62rem;
    color: var(--color-text-dim);
  }
</style>
