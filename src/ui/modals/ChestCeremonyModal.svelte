<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { playCollect, playLevelUp } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import { fade, fly } from 'svelte/transition';

  // Slot-machine reveal: items appear one at a time with rising pitch.
  let revealed = $state(0);
  let done = $state(false);
  let timers: ReturnType<typeof setTimeout>[] = [];

  $effect(() => {
    if (uiState.showChestCeremony) {
      revealed = 0;
      done = false;
      const total = uiState.chestRewards.length;
      for (let i = 0; i < total; i++) {
        timers.push(
          setTimeout(
            () => {
              revealed = i + 1;
              playCollect(1 + i * 0.2);
              haptics.select();
              if (i === total - 1) {
                if (total >= 5) playLevelUp(); // jackpot flourish
                timers.push(setTimeout(() => (done = true), 350));
              }
            },
            450 + i * 550,
          ),
        );
      }
      return () => {
        timers.forEach(clearTimeout);
        timers = [];
      };
    }
  });

  function close() {
    if (!done) {
      // Skip the reveal (impatient players are allowed dopamine too)
      revealed = uiState.chestRewards.length;
      done = true;
      return;
    }
    uiState.showChestCeremony = false;
    uiState.chestRewards = [];
  }

  let isJackpot = $derived(uiState.chestRewards.length >= 5);
</script>

{#if uiState.showChestCeremony}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    id="chest-modal"
    class:jackpot={isJackpot}
    transition:fade={{ duration: 200 }}
    onclick={close}
  >
    <div class="content" in:fly={{ y: 24, duration: 350 }}>
      <div class="header">
        <div class="chest-icon" class:shaking={revealed < uiState.chestRewards.length}>🗃️</div>
        <h2 class="title rarity-{uiState.chestRarity}">
          {isJackpot ? 'JACKPOT!' : uiState.chestRarity.toUpperCase() + ' CACHE'}
        </h2>
        <div class="subtitle">
          {uiState.chestRewards.length} MODULE{uiState.chestRewards.length > 1 ? 'S' : ''} RECOVERED
        </div>
      </div>

      <div class="rewards">
        {#each uiState.chestRewards as reward, i (i)}
          <div class="reward-row glass" class:revealed={i < revealed}>
            {#if i < revealed}
              <span class="reward-icon">
                {#if reward.icon.startsWith('<svg')}
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html reward.icon}
                {:else}
                  {reward.icon}
                {/if}
              </span>
              <span class="reward-name">{reward.name}</span>
              <span class="reward-detail">{reward.detail}</span>
            {:else}
              <span class="reward-mystery">?</span>
            {/if}
          </div>
        {/each}
      </div>

      <button class="continue-btn" class:ready={done} onclick={close}>
        {done ? 'CONTINUE' : 'SKIP'}
      </button>
    </div>
  </div>
{/if}

<style>
  #chest-modal {
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

  #chest-modal.jackpot {
    background:
      radial-gradient(ellipse 70% 60% at 50% 40%, rgba(255, 200, 60, 0.12), transparent 70%),
      rgba(4, 6, 15, 0.85);
  }

  .content {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    text-align: center;
  }

  .chest-icon {
    font-size: 2.4rem;
  }

  .chest-icon.shaking {
    animation: chest-shake 0.5s ease-in-out infinite;
  }

  @keyframes chest-shake {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-8deg) scale(1.05);
    }
    75% {
      transform: rotate(8deg) scale(1.05);
    }
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0.4rem 0 0;
  }

  .rarity-common {
    color: var(--color-text-main);
  }
  .rarity-rare {
    color: var(--color-primary);
  }
  .rarity-epic {
    color: var(--color-secondary);
  }

  .jackpot .title {
    color: #ffd75e;
    text-shadow: 0 0 18px rgba(255, 215, 94, 0.5);
  }

  .subtitle {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
    margin-top: 0.4rem;
  }

  .rewards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .reward-row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.7rem 1rem;
    border-radius: var(--r-md);
    min-height: 2.6rem;
    opacity: 0.45;
    transition: opacity 0.2s ease;
  }

  .reward-row.revealed {
    opacity: 1;
    animation: reveal-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes reveal-pop {
    from {
      transform: scale(0.92);
    }
    60% {
      transform: scale(1.04);
    }
    to {
      transform: scale(1);
    }
  }

  .reward-icon {
    width: 1.6rem;
    height: 1.6rem;
    display: inline-flex;
  }

  .reward-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .reward-name {
    flex: 1;
    text-align: left;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-text-main);
  }

  .reward-detail {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--color-accent, #ffd75e);
  }

  .reward-mystery {
    width: 100%;
    font-size: 1rem;
    font-weight: 800;
    color: var(--color-text-dim);
  }

  .continue-btn {
    all: unset;
    cursor: pointer;
    padding: 0.75rem;
    border-radius: var(--r-pill);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--color-text-dim);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
  }

  .continue-btn.ready {
    color: #04060f;
    background: var(--color-primary);
    border-color: transparent;
  }
</style>
