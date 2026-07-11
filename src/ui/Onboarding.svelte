<script lang="ts">
  import { uiState, saveLocal } from '../core/UIState.svelte.ts';
  import { fade, scale } from 'svelte/transition';
  import { playMenuClick } from '../core/audio';
  import { haptics } from '../core/haptics';

  const isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const tips = [
    {
      icon: '🕹️',
      title: 'MOVE',
      body: isTouch
        ? 'Drag anywhere on the left to steer. Your ship floats where you point.'
        : 'WASD or arrow keys to move. Kite the horde — never stop moving.',
    },
    {
      icon: '🎯',
      title: 'AUTO-FIRE',
      body: 'Your weapons aim and fire on their own at the nearest threat. Focus on positioning, not shooting.',
    },
    {
      icon: '💠',
      title: 'LEVEL UP',
      body: 'Grab glowing shards enemies drop. Fill the bar to level up and pick a new weapon or upgrade.',
    },
    {
      icon: '📦',
      title: 'CHESTS & EVOLUTIONS',
      body: 'Elites drop chests full of upgrades. Late-game chests can evolve a weapon into its ultimate form.',
    },
    {
      icon: '⏳',
      title: 'SURVIVE TO 10:00',
      body: 'A boss awakens at 8:00. Outlast the corruption to win — or push Endless for a score chase.',
    },
  ];

  function dismiss() {
    // Hide FIRST: on older iOS Safari a storage throw here left this
    // full-screen overlay permanently stuck over the game, eating every tap
    uiState.showOnboarding = false;
    playMenuClick();
    haptics.select();
    saveLocal('geo_onboarded', '1');
  }
</script>

{#if uiState.showOnboarding}
  <div id="onboarding" transition:fade={{ duration: 200 }}>
    <div class="onb-card glass" transition:scale={{ duration: 260, start: 0.95 }}>
      <div class="onb-head">
        <h2 class="onb-title">HOW TO SURVIVE</h2>
        <p class="onb-sub">Quick briefing, fighter</p>
      </div>

      <div class="onb-tips">
        {#each tips as tip (tip.title)}
          <div class="onb-tip">
            <span class="onb-icon">{tip.icon}</span>
            <div class="onb-text">
              <span class="onb-tip-title">{tip.title}</span>
              <span class="onb-tip-body">{tip.body}</span>
            </div>
          </div>
        {/each}
      </div>

      <button class="onb-btn" onclick={dismiss}>ENTER THE ARENA</button>
    </div>
  </div>
{/if}

<style>
  #onboarding {
    position: fixed;
    inset: 0;
    z-index: 2300;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 6, 15, 0.72);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    pointer-events: auto;
  }
  .onb-card {
    width: 100%;
    max-width: 400px;
    max-height: 85vh;
    overflow-y: auto;
    border-radius: var(--r-xl);
    padding: 1.75rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }
  .onb-head {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .onb-title {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--color-primary);
  }
  .onb-sub {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
  }
  .onb-tips {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .onb-tip {
    display: flex;
    gap: 0.85rem;
    align-items: flex-start;
  }
  .onb-icon {
    font-size: 1.4rem;
    line-height: 1.2;
    flex: 0 0 auto;
  }
  .onb-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .onb-tip-title {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--color-text-main);
  }
  .onb-tip-body {
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--color-text-dim);
  }
  .onb-btn {
    all: unset;
    cursor: pointer;
    text-align: center;
    padding: 1rem;
    border-radius: 12px;
    font-family: var(--font-heading);
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #04060f;
    background: var(--color-primary);
    transition: filter var(--transition-fast);
  }
  .onb-btn:hover {
    filter: brightness(1.08);
  }
</style>
