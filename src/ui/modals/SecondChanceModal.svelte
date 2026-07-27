<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { requestRewardedAd } from '../../core/portal';
  import { reviveSecondChance, declineSecondChance } from '../../systems/GameManager';
  import Modal from '../Modal.svelte';

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

<!-- The offer must be answered, so there's no ✕ and no backdrop escape:
     both exits are explicit buttons with their consequences spelled out. -->
<Modal
  open={uiState.showSecondChance}
  eyebrow="Emergency protocol"
  title="Signal lost"
  subtitle="One revive is available this run."
  size="sm"
  tone="pink"
  dismissible={false}
>
  <div class="revive-wrap">
    <div class="pulse-ring" aria-hidden="true"></div>
    <button class="revive-btn" disabled={requesting} onclick={watchAd}>
      <span class="revive-glyph" aria-hidden="true">▶</span>
      <span class="revive-text">
        <span class="revive-label">Second chance</span>
        <span class="revive-sub">{requesting ? 'Loading…' : 'Watch an ad · revive at 50% HP'}</span>
      </span>
    </button>
  </div>

  {#snippet footer()}
    <button class="ui-btn ghost" disabled={requesting} onclick={declineSecondChance}>
      Accept fate
    </button>
  {/snippet}
</Modal>

<style>
  /* Pulse traces the revive button's own shape (not a floating decoration
     elsewhere on the card), so the "tap here" cue sits exactly where the
     tap needs to land. */
  .revive-wrap {
    position: relative;
  }
  .pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: var(--r-lg);
    border: 2px solid var(--color-accent);
    pointer-events: none;
    animation: revive-pulse 1.9s ease-out infinite;
  }
  @keyframes revive-pulse {
    0% {
      opacity: 0.7;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.11);
    }
  }

  .revive-btn {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-height: 66px;
    padding: 0.85rem 1.1rem;
    border-radius: var(--r-lg);
    background: linear-gradient(135deg, #5cffbe, var(--color-accent) 60%, #17c98a);
    color: #03150e;
    box-shadow:
      0 10px 30px -12px rgba(56, 245, 168, 0.9),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    transition:
      filter var(--transition-fast),
      transform var(--transition-fast);
  }
  .revive-btn:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .revive-btn:active:not(:disabled) {
    transform: scale(0.985);
  }
  .revive-btn:disabled {
    cursor: wait;
    filter: saturate(0.5) brightness(0.85);
  }

  .revive-glyph {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(3, 21, 14, 0.16);
    font-size: 1rem;
  }
  .revive-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .revive-label {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1.1;
  }
  .revive-sub {
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(3, 21, 14, 0.66);
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-ring {
      animation: none;
      opacity: 0.5;
    }
  }
</style>
