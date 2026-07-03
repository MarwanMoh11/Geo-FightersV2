<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { getProtocol, selectProtocol } from '../../core/ProtocolRegistry';
  import { playUpgradeSelect } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import { fade, fly } from 'svelte/transition';

  let choices = $derived(uiState.protocolChoices.map((id) => getProtocol(id)).filter((p) => !!p));

  function pick(id: string) {
    playUpgradeSelect();
    haptics.select();
    selectProtocol(id);
  }
</script>

{#if uiState.showProtocolChoice}
  <div id="protocol-modal" transition:fade={{ duration: 200 }}>
    <div class="content">
      <div class="header" in:fly={{ y: -20, duration: 350, delay: 80 }}>
        <h2 class="title">Data Protocol</h2>
        <div class="subtitle">Choose the rule this run bends</div>
      </div>

      <div class="cards">
        {#each choices as proto, i (proto.id)}
          <button
            class="proto-card glass"
            style="animation-delay: {i * 90}ms"
            onclick={() => pick(proto.id)}
          >
            <span class="proto-icon">{proto.icon}</span>
            <span class="proto-name">{proto.name}</span>
            <span class="proto-desc">{proto.description}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  #protocol-modal {
    position: fixed;
    inset: 0;
    z-index: 2100;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(4, 6, 15, 0.82);
    backdrop-filter: blur(12px);
    padding: 1.5rem;
    pointer-events: auto;
  }

  .content {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  .header {
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: var(--color-text-main);
  }

  .subtitle {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-secondary);
    margin-top: 0.45rem;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .proto-card {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.95rem 1.1rem;
    border-radius: var(--r-md);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
    animation: card-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
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

  .proto-card:hover,
  .proto-card:focus-visible {
    border-color: var(--color-secondary);
    background: rgba(255, 255, 255, 0.05);
  }

  .proto-icon {
    font-size: 1.5rem;
  }

  .proto-name {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--color-text-main);
    white-space: nowrap;
  }

  .proto-desc {
    font-size: 0.68rem;
    color: var(--color-text-dim);
    line-height: 1.35;
  }
</style>
