<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';

  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (uiState.toast) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        uiState.toast = '';
      }, 4000);
    }
  });

  /* Mid-run the top-centre slot belongs to the timer and HP bar — a toast
     there sat directly on top of the two numbers you need most. During play
     it moves to the lower third instead, clear of the loadout bar. */
  let inGame = $derived(uiState.gameState === 'PLAYING' || uiState.gameState === 'PAUSED');
</script>

{#if uiState.toast}
  {#key uiState.toast}
    <div class="toast glass" class:in-game={inGame} role="status" aria-live="polite">
      {uiState.toast}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    top: calc(1rem + var(--safe-top, 0px));
    transform: translateX(-50%);
    z-index: var(--z-toast);
    max-width: min(90vw, 26rem);
    padding: 0.6rem 1.1rem;
    border-radius: var(--r-pill);
    font-size: var(--fs-label);
    font-weight: 600;
    line-height: 1.35;
    color: var(--color-text-main);
    text-align: center;
    pointer-events: none;
    animation: toast-in 0.35s var(--ease-out-expo) both;
  }

  .toast.in-game {
    top: auto;
    bottom: calc(6rem + var(--safe-bottom, 0px));
    animation-name: toast-in-up;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, -12px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes toast-in-up {
    from {
      opacity: 0;
      transform: translate(-50%, 12px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
