<script lang="ts">
  // Door prompt (Phase 1.96 JACK IN): shown while standing at a ready node.
  // Keyboard shortcuts live in BreachSystem; these buttons are the mouse/touch
  // path so mobile players get the same verbs.
  import { uiState } from '../core/UIState.svelte.ts';
  import { startBreach, useSkeletonKey } from '../systems/BreachSystem';
</script>

{#if uiState.breachPrompt && !uiState.breach}
  {@const p = uiState.breachPrompt}
  <div class="breach-prompt" style={`--pcolor:${p.color};`}>
    <div class="bp-name">{p.icon} {p.name}</div>
    <div class="bp-sec">
      {#if p.security === 0}
        SECURITY ZERO — FIRST BREACH FREE
      {:else}
        SECURITY {'▮'.repeat(p.security)}{'▯'.repeat(3 - p.security)}
      {/if}
    </div>
    <div class="bp-buttons">
      <button class="bp-btn main" onclick={() => startBreach(false)}>
        JACK IN <kbd>E</kbd>
      </button>
      <button class="bp-btn oc" onclick={() => startBreach(true)}>
        OVERCLOCK ×2 <kbd>Q</kbd>
      </button>
      {#if p.hasKey}
        <button class="bp-btn key" onclick={useSkeletonKey}>
          🗝️ KEY <kbd>F</kbd>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .breach-prompt {
    position: absolute;
    left: 50%;
    bottom: 24%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.55rem 0.85rem;
    background: rgba(6, 12, 20, 0.88);
    border: 1px solid var(--pcolor);
    border-radius: 10px;
    box-shadow: 0 0 18px color-mix(in srgb, var(--pcolor) 35%, transparent);
    pointer-events: auto;
    animation: bp-in 0.18s ease-out;
  }
  @keyframes bp-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(8px);
    }
  }

  .bp-name {
    font-family: var(--font-heading);
    font-size: 0.85rem;
    letter-spacing: 0.12em;
    color: var(--pcolor);
    text-shadow: 0 0 8px var(--pcolor);
  }
  .bp-sec {
    font-family: var(--font-mono);
    font-size: 0.52rem;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.7);
  }

  .bp-buttons {
    display: flex;
    gap: 0.45rem;
    margin-top: 0.15rem;
  }
  .bp-btn {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0.45rem 0.7rem;
    border-radius: 7px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .bp-btn kbd {
    font-size: 0.5rem;
    padding: 0.08rem 0.28rem;
    border: 1px solid currentColor;
    border-radius: 3px;
    opacity: 0.75;
  }
  .bp-btn.main {
    background: color-mix(in srgb, var(--pcolor) 22%, transparent);
    border: 1px solid var(--pcolor);
    color: #fff;
    text-shadow: 0 0 6px var(--pcolor);
  }
  .bp-btn.oc {
    background: rgba(255, 61, 119, 0.14);
    border: 1px solid #ff3d77;
    color: #ffb3c9;
  }
  .bp-btn.key {
    background: rgba(255, 215, 94, 0.14);
    border: 1px solid #ffd75e;
    color: #ffe9a8;
  }

  @media (max-width: 700px) {
    .breach-prompt {
      bottom: 32%;
    }
  }
</style>
