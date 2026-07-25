<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { resolveVictoryChoice } from '../../systems/GameManager';
  import { playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import Modal from '../Modal.svelte';

  function choose(stay: boolean) {
    playMenuClick();
    haptics.select();
    resolveVictoryChoice(stay);
  }
</script>

<!-- Not dismissible: the run cannot continue until one of the two futures is
     picked, and a stray backdrop tap should never decide it. -->
<Modal
  open={uiState.showVictoryChoice}
  eyebrow="Objective complete"
  title="Corruption purged"
  subtitle="The system is clean… but the signal keeps growing."
  size="sm"
  tone="green"
  dismissible={false}
>
  <div class="choices">
    <button class="choice stay" onclick={() => choose(true)}>
      <span class="choice-icon" aria-hidden="true">∞</span>
      <span class="choice-text">
        <span class="choice-label">Stay in the system</span>
        <span class="choice-sub">Endless mode — push your score as far as it goes.</span>
      </span>
    </button>
    <button class="choice extract" onclick={() => choose(false)}>
      <span class="choice-icon" aria-hidden="true">↥</span>
      <span class="choice-text">
        <span class="choice-label">Extract</span>
        <span class="choice-sub">Bank the win and take your credits home.</span>
      </span>
    </button>
  </div>
</Modal>

<style>
  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .choice {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-height: var(--tap);
    padding: 0.9rem 1rem;
    border-radius: var(--r-md);
    border: 1px solid var(--color-border);
    background: var(--surface-2);
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }
  .choice:hover {
    background: var(--surface-3);
    transform: translateY(-1px);
  }
  .choice:active {
    transform: scale(0.985);
  }

  .choice-icon {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.06);
    font-size: 1.2rem;
    font-weight: 800;
    line-height: 1;
    color: var(--color-text-dim);
  }
  .choice-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .choice-label {
    font-size: var(--fs-label);
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--color-text-main);
  }
  .choice-sub {
    font-size: var(--fs-micro);
    line-height: 1.4;
    color: var(--color-text-dim);
  }

  .choice.stay {
    border-color: rgba(56, 245, 168, 0.5);
    background: rgba(56, 245, 168, 0.08);
  }
  .choice.stay .choice-label {
    color: var(--color-accent);
  }
  .choice.stay .choice-icon {
    color: var(--color-accent);
    background: rgba(56, 245, 168, 0.14);
  }
</style>
