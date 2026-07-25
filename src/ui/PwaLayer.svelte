<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { applyUpdate } from '../core/pwa';
</script>

<!-- New build available (service worker updated in the background) -->
{#if uiState.needsRefresh}
  <div class="update-toast glass">
    <span class="update-text">New version ready</span>
    <button class="update-btn" onclick={applyUpdate}>Refresh</button>
  </div>
{/if}

<style>
  .update-toast {
    position: fixed;
    left: 50%;
    bottom: calc(1rem + var(--safe-bottom));
    transform: translateX(-50%);
    z-index: calc(var(--z-toast) - 1);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-radius: var(--r-pill);
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
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--color-text-main);
  }

  .update-btn {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    /* Full-size target — this used to be a ~26px pill, easy to fat-finger */
    min-height: var(--tap);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fs-label);
    font-weight: 700;
    color: #04060f;
    background: var(--color-primary);
    padding: 0.4rem 1.1rem;
    border-radius: var(--r-pill);
    transition: filter var(--transition-fast);
  }

  .update-btn:hover {
    filter: brightness(1.1);
  }

  .update-btn:active {
    transform: scale(0.96);
  }
</style>
