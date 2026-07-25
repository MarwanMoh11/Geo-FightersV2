<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { getProtocol, selectProtocol } from '../../core/ProtocolRegistry';
  import { playUpgradeSelect } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import Modal from '../Modal.svelte';

  let choices = $derived(uiState.protocolChoices.map((id) => getProtocol(id)).filter((p) => !!p));

  function pick(id: string) {
    playUpgradeSelect();
    haptics.select();
    selectProtocol(id);
  }
</script>

<Modal
  open={uiState.showProtocolChoice}
  eyebrow="Run modifier"
  title="Data protocol"
  subtitle="Pick the rule this run bends. It stays active until the run ends."
  size="lg"
  tone="cyan"
  dismissible={false}
>
  <div class="cards">
    {#each choices as proto, i (proto.id)}
      <button class="proto-card" style="animation-delay: {i * 80}ms" onclick={() => pick(proto.id)}>
        <span class="proto-icon" aria-hidden="true">{proto.icon}</span>
        <span class="proto-name">{proto.name}</span>
        <span class="proto-desc">{proto.description}</span>
      </button>
    {/each}
  </div>
</Modal>

<style>
  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .proto-card {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    min-height: var(--tap);
    padding: 0.9rem 1rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    animation: card-in 0.45s var(--ease-out-expo) both;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast),
      box-shadow var(--transition-fast);
  }
  .proto-card:hover {
    background: var(--surface-3);
    border-color: var(--color-border-bright);
    box-shadow: inset 0 0 0 1px rgba(54, 230, 255, 0.28);
    transform: translateY(-2px);
  }
  .proto-card:active {
    transform: scale(0.99);
  }
  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .proto-icon {
    font-size: 1.5rem;
    line-height: 1.1;
  }
  .proto-name {
    font-family: var(--font-heading);
    font-size: var(--fs-heading);
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--color-text-main);
  }
  .proto-desc {
    font-size: var(--fs-caption);
    line-height: 1.45;
    color: var(--color-text-dim);
  }

  @media (min-width: 780px) {
    .cards {
      flex-direction: row;
    }
    .proto-card {
      flex: 1;
      min-width: 0;
      padding: 1.2rem 1.1rem;
    }
  }
</style>
