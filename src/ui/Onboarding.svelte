<script lang="ts">
  /**
   * First-run briefing.
   *
   * Was a single card listing five paragraphs at 0.72rem — a wall nobody
   * reads while a horde is already spawning behind it. It is now three paced
   * beats, each with one idea and a diagram, tuned to the device's actual
   * input method. Everything beyond "how do I move and why am I not
   * shooting" is deferred to contextual tips and How to Play, so the time
   * between opening the game and playing it stays a few seconds.
   */
  import { uiState, saveLocal } from '../core/UIState.svelte.ts';
  import { fade, fly } from 'svelte/transition';
  import { playMenuClick } from '../core/audio';
  import { haptics } from '../core/haptics';

  const isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  interface Step {
    art: 'move' | 'auto' | 'xp';
    title: string;
    body: string;
  }

  const steps: Step[] = [
    {
      art: 'move',
      title: isTouch ? 'Drag to move' : 'WASD to move',
      body: isTouch
        ? 'Touch anywhere and drag. A stick appears under your thumb and your fighter follows it.'
        : 'Use WASD or the arrow keys. Keep moving — standing still is how runs end.',
    },
    {
      art: 'auto',
      title: 'You never shoot',
      body: 'Your weapons target and fire on their own. Your whole job is where to stand.',
    },
    {
      art: 'xp',
      title: 'Collect, level, choose',
      body: 'Enemies drop glowing shards. Fill the bar to level up and pick a new weapon or upgrade.',
    },
  ];

  let index = $state(0);
  let last = $derived(index === steps.length - 1);

  function next() {
    playMenuClick();
    haptics.select();
    if (last) dismiss();
    else index += 1;
  }

  function back() {
    playMenuClick();
    if (index > 0) index -= 1;
  }

  function dismiss() {
    // Hide FIRST: on older iOS Safari a storage throw here left this
    // full-screen overlay permanently stuck over the game, eating every tap
    uiState.showOnboarding = false;
    playMenuClick();
    haptics.select();
    saveLocal('geo_onboarded', '1');
  }

  function onKeydown(e: KeyboardEvent) {
    if (!uiState.showOnboarding) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  /* Swipe between steps — the gesture the layout already implies. */
  let touchStartX = 0;
  function onTouchStart(e: TouchEvent) {
    touchStartX = e.changedTouches[0].clientX;
  }
  function onTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -45) next();
    else if (dx > 45) back();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if uiState.showOnboarding}
  <div id="onboarding" transition:fade={{ duration: 200 }}>
    <div
      class="onb-card sheet"
      ontouchstart={onTouchStart}
      ontouchend={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
    >
      <button class="onb-skip" onclick={dismiss}>Skip</button>

      {#key index}
        <div class="onb-body" in:fly={{ x: 24, duration: 260 }}>
          <!-- Diagrams, not decoration: each one shows the exact thing the
               sentence beside it is describing. -->
          <div class="onb-art" aria-hidden="true">
            {#if steps[index].art === 'move'}
              <!-- Same vocabulary as every other tutorial in the game: a
                   ghost finger on the stick, the ship trailing it. -->
              <svg viewBox="0 0 120 90">
                <circle class="ring" cx="42" cy="52" r="24" />
                <path class="trail" d="M42 52 L56 44" />
                <circle class="knob" cx="56" cy="44" r="11" />
                <circle class="ghost" cx="56" cy="44" r="13" />
                <path class="ship" d="M96 30 l9 8 -9 8 -9 -8z" />
                <path class="arrow" d="M74 42 h14 m-4 -4 l4 4 -4 4" />
              </svg>
            {:else if steps[index].art === 'auto'}
              <svg viewBox="0 0 120 90">
                <path class="ship" d="M30 45 l10 9 -10 9 -10 -9z" />
                <path class="beam" d="M42 52 H86" />
                <path class="beam b2" d="M42 48 L84 28" />
                <circle class="foe" cx="92" cy="52" r="7" />
                <circle class="foe" cx="90" cy="25" r="6" />
                <circle class="spark" cx="92" cy="52" r="12" />
              </svg>
            {:else}
              <svg viewBox="0 0 120 90">
                <path class="ship" d="M34 50 l10 9 -10 9 -10 -9z" />
                <path class="shard" d="M70 30 l6 9 -6 9 -6 -9z" />
                <path class="shard s2" d="M92 46 l5 7 -5 7 -5 -7z" />
                <path class="pull" d="M62 48 H46" />
                <rect class="bar-bg" x="24" y="72" width="72" height="6" rx="3" />
                <rect class="bar-fill" x="24" y="72" width="48" height="6" rx="3" />
              </svg>
            {/if}
          </div>

          <h2 class="onb-title">{steps[index].title}</h2>
          <p class="onb-text">{steps[index].body}</p>
        </div>
      {/key}

      <div class="onb-dots" role="tablist" aria-label="Briefing steps">
        {#each steps as _, i (i)}
          <button
            class="onb-dot"
            class:on={i === index}
            role="tab"
            aria-selected={i === index}
            aria-label="Step {i + 1}"
            onclick={() => (index = i)}
          ></button>
        {/each}
      </div>

      <button class="ui-btn primary lg block" onclick={next}>
        {last ? 'Enter the arena' : 'Next'}
      </button>
    </div>
  </div>
{/if}

<style>
  #onboarding {
    position: fixed;
    inset: 0;
    z-index: var(--z-onboarding);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 6, 15, 0.82);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: var(--pad-top) var(--pad-right) var(--pad-bottom) var(--pad-left);
    pointer-events: auto;
  }

  .onb-card {
    position: relative;
    width: 100%;
    max-width: 23rem;
    max-height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    border-radius: var(--r-xl);
    padding: 1.5rem 1.35rem 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    animation: onb-in 0.32s var(--ease-out-expo) both;
  }
  @keyframes onb-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.97);
    }
  }

  .onb-skip {
    all: unset;
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    cursor: pointer;
    min-height: 36px;
    display: flex;
    align-items: center;
    padding: 0 0.6rem;
    border-radius: var(--r-sm);
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--color-text-faint);
    transition: color var(--transition-fast);
  }
  .onb-skip:hover {
    color: var(--color-text-main);
  }

  .onb-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    text-align: center;
    min-height: 13.5rem;
    justify-content: center;
  }

  .onb-art {
    width: 100%;
    max-width: 15rem;
    margin-bottom: 0.3rem;
  }
  .onb-art svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  /* Shared diagram vocabulary */
  .ring {
    fill: rgba(255, 255, 255, 0.04);
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 1.5;
  }
  .knob {
    fill: var(--color-primary);
    filter: drop-shadow(0 0 6px rgba(54, 230, 255, 0.9));
    animation: knob-drift 2.6s ease-in-out infinite;
  }
  @keyframes knob-drift {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(-12px, 10px);
    }
  }
  .trail {
    stroke: rgba(54, 230, 255, 0.5);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  /* Ghost finger — the shared "touch here" mark used by every tutorial */
  .ghost {
    fill: rgba(255, 255, 255, 0.55);
    stroke: rgba(255, 255, 255, 0.9);
    stroke-width: 1.2;
    animation: knob-drift 2.6s ease-in-out infinite;
  }
  .ship {
    fill: var(--color-text-main);
    filter: drop-shadow(0 0 6px rgba(234, 242, 255, 0.5));
  }
  .arrow {
    stroke: var(--color-text-dim);
    stroke-width: 1.6;
    fill: none;
    stroke-linecap: round;
  }
  .beam {
    stroke: var(--color-primary);
    stroke-width: 2.5;
    stroke-linecap: round;
    filter: drop-shadow(0 0 5px rgba(54, 230, 255, 0.9));
    animation: beam-fire 1.1s ease-out infinite;
  }
  .beam.b2 {
    animation-delay: 0.45s;
  }
  @keyframes beam-fire {
    0% {
      opacity: 0;
      stroke-dasharray: 4 60;
      stroke-dashoffset: 60;
    }
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0.15;
      stroke-dashoffset: 0;
      stroke-dasharray: 60 0;
    }
  }
  .foe {
    fill: var(--color-secondary);
    opacity: 0.9;
  }
  .spark {
    fill: none;
    stroke: var(--color-secondary);
    stroke-width: 1.5;
    opacity: 0;
    animation: spark-pop 1.1s ease-out infinite;
  }
  @keyframes spark-pop {
    0%,
    40% {
      opacity: 0;
      r: 7;
    }
    60% {
      opacity: 0.8;
    }
    100% {
      opacity: 0;
      r: 15;
    }
  }
  .shard {
    fill: var(--color-gold);
    filter: drop-shadow(0 0 5px rgba(255, 216, 77, 0.9));
    animation: shard-pull 2s ease-in infinite;
  }
  .shard.s2 {
    animation-delay: 0.7s;
  }
  @keyframes shard-pull {
    0% {
      transform: translate(0, 0);
      opacity: 1;
    }
    70% {
      transform: translate(-34px, 12px);
      opacity: 1;
    }
    100% {
      transform: translate(-40px, 14px);
      opacity: 0;
    }
  }
  .pull {
    stroke: rgba(255, 216, 77, 0.4);
    stroke-width: 1.4;
    stroke-dasharray: 3 4;
  }
  .bar-bg {
    fill: rgba(255, 255, 255, 0.1);
  }
  .bar-fill {
    fill: var(--color-gold);
    animation: bar-grow 2.6s ease-in-out infinite;
  }
  @keyframes bar-grow {
    0% {
      width: 20px;
    }
    70% {
      width: 72px;
    }
    100% {
      width: 72px;
    }
  }

  .onb-title {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: var(--color-primary);
  }
  .onb-text {
    margin: 0;
    font-size: var(--fs-body);
    line-height: 1.55;
    color: var(--color-text-dim);
    text-wrap: balance;
  }

  .onb-dots {
    display: flex;
    gap: 0.3rem;
  }
  .onb-dot {
    all: unset;
    cursor: pointer;
    width: 28px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .onb-dot::before {
    content: '';
    width: 100%;
    height: 3px;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.16);
    transition: background var(--transition-smooth);
  }
  .onb-dot.on::before {
    background: var(--color-primary);
    box-shadow: 0 0 8px rgba(54, 230, 255, 0.8);
  }

  @media (prefers-reduced-motion: reduce) {
    .knob,
    .ghost,
    .beam,
    .spark,
    .shard,
    .bar-fill {
      animation: none;
    }
  }
</style>
