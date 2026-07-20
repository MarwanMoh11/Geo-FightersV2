<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { requestRewardedAd } from '../../core/portal';
  import { reviveSecondChance, declineSecondChance } from '../../systems/GameManager';
  import { fade, fly } from 'svelte/transition';

  // Guard against double taps while the ad request is in flight.
  let requesting = $state(false);

  function watchAd() {
    if (requesting) return;
    requesting = true;
    requestRewardedAd(
      () => {
        requesting = false;
        reviveSecondChance();
      },
      () => {
        // Ad failed to load/play — portal rule: no reward. Death stands.
        requesting = false;
        declineSecondChance();
      },
    );
  }
</script>

{#if uiState.showSecondChance}
  <div id="second-chance-modal" transition:fade={{ duration: 250 }}>
    <div class="content glass" in:fly={{ y: 30, duration: 400, delay: 150 }}>
      <div class="pulse-ring"></div>
      <h2 class="title">SIGNAL LOST</h2>
      <div class="subtitle">EMERGENCY PROTOCOL AVAILABLE</div>

      <button class="revive-btn" disabled={requesting} onclick={watchAd}>
        <span class="btn-text">▶ SECOND CHANCE</span>
        <span class="btn-subtext">{requesting ? 'LOADING…' : 'WATCH AD · REVIVE AT 50% HP'}</span>
      </button>

      <button class="decline-btn" disabled={requesting} onclick={declineSecondChance}>
        ACCEPT FATE
      </button>
    </div>
  </div>
{/if}

<style>
  #second-chance-modal {
    position: fixed;
    inset: 0;
    z-index: 3200; /* above the HUD, below nothing — this IS the moment */
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(8, 4, 8, 0.72);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    pointer-events: auto;
  }

  .content {
    position: relative;
    width: 100%;
    max-width: 340px;
    border-radius: var(--r-xl);
    padding: 2.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    text-align: center;
  }

  .pulse-ring {
    position: absolute;
    top: -18px;
    left: 50%;
    width: 36px;
    height: 36px;
    margin-left: -18px;
    border-radius: 50%;
    border: 2px solid var(--color-gold);
    animation: sc-pulse 1.2s ease-out infinite;
    pointer-events: none;
  }
  @keyframes sc-pulse {
    0% {
      transform: scale(0.7);
      opacity: 0.9;
    }
    100% {
      transform: scale(1.6);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse-ring {
      animation: none;
      opacity: 0.5;
    }
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: var(--color-secondary);
  }

  .subtitle {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }

  .revive-btn {
    all: unset;
    cursor: pointer;
    padding: 1.1rem;
    border-radius: var(--r-md);
    background: var(--color-gold, #ffd75e);
    color: #1b1206;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    transition: all var(--transition-fast);
  }
  .revive-btn:hover {
    filter: brightness(1.08);
  }
  .revive-btn:active {
    transform: scale(0.985);
  }
  .revive-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .revive-btn .btn-text {
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .revive-btn .btn-subtext {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .decline-btn {
    all: unset;
    cursor: pointer;
    padding: 0.7rem;
    border-radius: var(--r-md);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--color-text-dim);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
  }
  .decline-btn:hover {
    color: var(--color-text-main);
    border-color: var(--color-border-bright);
  }
  .decline-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
