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
    z-index: 6000;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0.6rem 0.6rem 0.6rem 1rem;
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
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--color-text-main);
  }

  .update-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    color: #04060f;
    background: var(--color-primary);
    padding: 0.4rem 0.9rem;
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
