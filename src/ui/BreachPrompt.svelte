<script lang="ts">
  // Door prompt (Phase 1.96 JACK IN): shown while standing at a ready node.
  // Keyboard shortcuts live in BreachSystem; these buttons are the mouse/touch
  // path so mobile players get the same verbs.
  import { uiState } from '../core/UIState.svelte.ts';
  import { startBreach, useSkeletonKey } from '../systems/BreachSystem';
  import { haptics } from '../core/haptics';

  function jack(overclock: boolean) {
    haptics.select();
    startBreach(overclock);
  }

  function key() {
    haptics.select();
    useSkeletonKey();
  }
</script>

{#if uiState.breachPrompt && !uiState.breach}
  {@const p = uiState.breachPrompt}
  <div class="breach-prompt" style={`--pcolor:${p.color};`}>
    <div class="bp-head">
      <span class="bp-icon" aria-hidden="true">{p.icon}</span>
      <span class="bp-name">{p.name}</span>
      {#if p.opened}
        <span class="bp-flag">BREACHED</span>
      {/if}
    </div>

    <!-- Rootkits are the only exploits in the game and nothing used to say
         where they came from. Vault doors now advertise it up front. -->
    {#if p.rootkit}
      <div class="bp-rootkit">
        <span aria-hidden="true">💀</span>
        ROOTKIT VAULT — win the dive to pull an exploit
      </div>
    {/if}

    <div class="bp-sec">
      {#if p.security === 0}
        Security zero — first breach is free
      {:else}
        Security
        <span class="bp-pips" aria-label="Security level {p.security} of 3">
          {#each Array(3) as _, i (i)}
            <span class="bp-pip" class:on={i < p.security}></span>
          {/each}
        </span>
      {/if}
    </div>

    <div class="bp-buttons">
      <button class="bp-btn main" onclick={() => jack(false)}>
        <span class="bp-label">Jack in</span>
        <kbd class="kbd pointer-only">E</kbd>
      </button>
      <!-- The trade is now stated outright: it used to read "OVERCLOCK ×2"
           with nothing to say what doubled or what it cost. -->
      <button class="bp-btn oc" onclick={() => jack(true)}>
        <span class="bp-label">Overclock</span>
        <span class="bp-sub">2× loot · harder</span>
        <kbd class="kbd pointer-only">Q</kbd>
      </button>
      {#if p.hasKey}
        <button class="bp-btn key" onclick={key}>
          <span class="bp-label">🗝️ Key</span>
          <span class="bp-sub">Skip it</span>
          <kbd class="kbd pointer-only">F</kbd>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .breach-prompt {
    /* FIXED + above the mobile steering layer (z 80): at its old z-index 6
       the full-screen joystick zone swallowed every tap on JACK IN, which
       made breaches unreachable on touch devices. */
    position: fixed;
    left: 50%;
    bottom: 24%;
    transform: translateX(-50%);
    z-index: var(--z-prompt);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 0.7rem 0.9rem;
    max-width: min(92vw, 26rem);
    background: rgba(6, 12, 20, 0.92);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--pcolor);
    border-radius: var(--r-lg);
    box-shadow:
      0 0 26px color-mix(in srgb, var(--pcolor) 30%, transparent),
      var(--elev-2);
    pointer-events: auto;
    animation: bp-in 0.18s ease-out;
  }
  @keyframes bp-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(8px);
    }
  }

  .bp-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .bp-icon {
    font-size: 1rem;
    line-height: 1;
  }
  .bp-name {
    font-family: var(--font-heading);
    font-size: var(--fs-label);
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--pcolor);
    text-shadow: 0 0 10px var(--pcolor);
  }
  .bp-flag {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    padding: 0.1rem 0.32rem;
    border-radius: var(--r-pill);
    background: rgba(56, 245, 168, 0.16);
    color: var(--color-accent);
  }

  .bp-rootkit {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    border-radius: var(--r-pill);
    background: rgba(255, 61, 119, 0.14);
    border: 1px solid rgba(255, 61, 119, 0.55);
    font-family: var(--font-mono);
    font-size: 0.5rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #ffb3c9;
    text-align: center;
  }

  .bp-sec {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.68);
  }
  .bp-pips {
    display: inline-flex;
    gap: 3px;
  }
  .bp-pip {
    width: 10px;
    height: 5px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.16);
  }
  .bp-pip.on {
    background: var(--color-secondary);
    box-shadow: 0 0 6px rgba(255, 61, 119, 0.8);
  }

  .bp-buttons {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.2rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  /* Every verb is a full-size target: at 0.45rem of padding these were ~26px
     tall, and missing "Jack in" while a horde closes in is a real loss. */
  .bp-btn {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    min-height: var(--tap);
    min-width: 5.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 0.4rem 0.7rem;
    border-radius: var(--r-md);
    text-align: center;
    transition:
      filter var(--transition-fast),
      transform var(--transition-fast);
  }
  .bp-btn:hover {
    filter: brightness(1.15);
  }
  .bp-btn:active {
    transform: scale(0.96);
  }
  .bp-label {
    font-family: var(--font-mono);
    font-size: var(--fs-caption);
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .bp-sub {
    font-size: 0.5rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    opacity: 0.75;
  }
  .bp-btn .kbd {
    margin-top: 2px;
    font-size: 0.5rem;
  }

  .bp-btn.main {
    background: color-mix(in srgb, var(--pcolor) 26%, transparent);
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
      bottom: 30%;
    }
  }
</style>
