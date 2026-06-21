<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { applyUpdate } from '../core/pwa';
</script>

<!-- Rotate-to-landscape hint: this is a twin-stick game best played wide.
     Shown only on touch devices held in portrait. -->
<div class="rotate-overlay">
  <div class="rotate-card">
    <div class="phone">
      <div class="phone-screen"></div>
    </div>
    <p class="rotate-title">ROTATE DEVICE</p>
    <p class="rotate-sub">GEOFIGHTERS PLAYS BEST IN LANDSCAPE</p>
  </div>
</div>

<!-- New build available (service worker updated in the background) -->
{#if uiState.needsRefresh}
  <div class="update-toast glass">
    <span class="update-text">NEW VERSION READY</span>
    <button class="update-btn" onclick={applyUpdate}>REFRESH</button>
  </div>
{/if}

<style>
  .rotate-overlay {
    position: fixed;
    inset: 0;
    z-index: 5000;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: radial-gradient(ellipse at center, #0a0e20 0%, var(--color-bg-dark) 75%);
    pointer-events: auto;
  }

  /* Only intervene on touch devices held upright. */
  @media (orientation: portrait) and (pointer: coarse) {
    .rotate-overlay {
      display: flex;
    }
  }

  .rotate-card {
    text-align: center;
    animation: card-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .phone {
    width: 56px;
    height: 96px;
    margin: 0 auto 1.75rem;
    border: 3px solid var(--color-primary);
    border-radius: 12px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35);
    display: flex;
    justify-content: center;
    align-items: center;
    animation: rotate-phone 2.4s ease-in-out infinite;
  }

  .phone-screen {
    width: 70%;
    height: 70%;
    border-radius: 4px;
    background: rgba(0, 229, 255, 0.12);
  }

  @keyframes rotate-phone {
    0%,
    40% {
      transform: rotate(0deg);
    }
    60%,
    100% {
      transform: rotate(-90deg);
    }
  }

  .rotate-title {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: 900;
    font-size: 1.4rem;
    letter-spacing: 0.18em;
    color: var(--color-text-main);
    text-shadow: 0 0 18px var(--color-primary);
  }

  .rotate-sub {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.25em;
    color: var(--color-text-dim);
  }

  .update-toast {
    position: fixed;
    left: 50%;
    bottom: calc(1rem + var(--safe-bottom));
    transform: translateX(-50%);
    z-index: 6000;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.7rem 1rem 0.7rem 1.2rem;
    border-radius: 12px;
    border: 1px solid var(--color-border-bright);
    pointer-events: auto;
    animation: toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 16px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .update-text {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    color: var(--color-text-main);
  }

  .update-btn {
    all: unset;
    cursor: pointer;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--color-primary);
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--color-border-bright);
    transition: all var(--transition-fast);
  }

  .update-btn:hover {
    background: rgba(0, 229, 255, 0.15);
  }

  .update-btn:active {
    transform: scale(0.95);
  }
</style>
