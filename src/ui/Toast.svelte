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
</script>

{#if uiState.toast}
  {#key uiState.toast}
    <div class="toast glass">{uiState.toast}</div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    top: calc(1rem + var(--safe-top, 0px));
    transform: translateX(-50%);
    z-index: 7000;
    max-width: min(90vw, 26rem);
    padding: 0.6rem 1.1rem;
    border-radius: var(--r-pill);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-main);
    text-align: center;
    pointer-events: none;
    animation: toast-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
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
</style>
