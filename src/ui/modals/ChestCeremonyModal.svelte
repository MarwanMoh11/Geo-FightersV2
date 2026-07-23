<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import {
    startChestFanfare,
    endChestFanfare,
    playRevealStrum,
    playLevelUp,
  } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import { fade } from 'svelte/transition';

  // Slot-machine reveal: items appear one at a time with rising strums, the
  // whole thing scored by its own fanfare loop (main soundtrack ducks under).
  let revealed = $state(0);
  let done = $state(false);
  let burst = $state(0); // increments per reveal → re-keys the flash/shake
  let timers: ReturnType<typeof setTimeout>[] = [];

  let isJackpot = $derived(uiState.chestRewards.length >= 5);

  // Confetti pieces (jackpot only) — randomized once per ceremony.
  let confetti = $state<{ left: number; delay: number; dur: number; hue: number; drift: number }[]>(
    [],
  );

  $effect(() => {
    if (uiState.showChestCeremony) {
      revealed = 0;
      done = false;
      burst = 0;
      const total = uiState.chestRewards.length;
      const jackpot = total >= 5;
      startChestFanfare(jackpot);

      confetti = jackpot
        ? Array.from({ length: 36 }, () => ({
            left: Math.random() * 100,
            delay: Math.random() * 1.6,
            dur: 2.2 + Math.random() * 1.8,
            hue: 35 + Math.random() * 320,
            drift: (Math.random() - 0.5) * 160,
          }))
        : [];

      for (let i = 0; i < total; i++) {
        timers.push(
          setTimeout(
            () => {
              revealed = i + 1;
              burst++;
              playRevealStrum(i);
              haptics.select();
              if (i === total - 1) {
                if (total >= 5) playLevelUp(); // jackpot flourish on top
                timers.push(setTimeout(() => (done = true), 400));
              }
            },
            650 + i * 650,
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
    endChestFanfare();
    uiState.showChestCeremony = false;
    uiState.chestRewards = [];
  }

  // Multiplayer doesn't pause for the ceremony — if the run ends while it's
  // open, kill the fanfare and get out of the way of the game-over screen.
  $effect(() => {
    if (uiState.gameState === 'GAME_OVER' && uiState.showChestCeremony) {
      endChestFanfare();
      uiState.showChestCeremony = false;
      uiState.chestRewards = [];
    }
  });
</script>

{#if uiState.showChestCeremony}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    id="chest-modal"
    class="rarity-{uiState.chestRarity}"
    class:jackpot={isJackpot}
    transition:fade={{ duration: 250 }}
    onclick={close}
  >
    <!-- Rotating god-rays + pulsing core glow -->
    <div class="rays"></div>
    <div class="rays rays-2"></div>
    <div class="core-glow"></div>

    <!-- Jackpot confetti rain -->
    {#each confetti as piece, i (i)}
      <span
        class="confetti"
        style="left: {piece.left}%; animation-delay: {piece.delay}s; animation-duration: {piece.dur}s; --hue: {piece.hue}; --drift: {piece.drift}px"
      ></span>
    {/each}

    {#key burst}
      <div class="flash"></div>
    {/key}

    <div class="content" class:shake-it={burst > 0 && !done}>
      <div class="header">
        <div class="chest-stage">
          <div
            class="chest-icon"
            class:opening={revealed > 0}
            class:shaking={revealed < uiState.chestRewards.length}
          >
            🗃️
          </div>
          {#if revealed > 0}
            {#key burst}
              <div class="chest-burst">✦</div>
            {/key}
          {/if}
        </div>
        <h2 class="title">
          {isJackpot ? '⚡ JACKPOT ⚡' : uiState.chestRarity.toUpperCase() + ' CACHE'}
        </h2>
        <div class="subtitle">
          {uiState.chestRewards.length} MODULE{uiState.chestRewards.length > 1 ? 'S' : ''} RECOVERED
        </div>
      </div>

      <div class="rewards">
        {#each uiState.chestRewards as reward, i (i)}
          <div class="reward-row glass" class:revealed={i < revealed} style="--i: {i}">
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
              <span class="reward-sheen"></span>
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
    --ceremony-color: #c8904a;
    --ceremony-glow: rgba(200, 144, 74, 0.35);
    position: fixed;
    inset: 0;
    z-index: 2100;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(3, 4, 12, 0.88);
    backdrop-filter: blur(14px);
    padding: 1.5rem;
    pointer-events: auto;
    overflow: hidden;
  }

  #chest-modal.rarity-uncommon {
    --ceremony-color: #44aaff;
    --ceremony-glow: rgba(68, 170, 255, 0.35);
  }

  #chest-modal.rarity-rare {
    --ceremony-color: #b44dff;
    --ceremony-glow: rgba(180, 77, 255, 0.4);
  }

  #chest-modal.rarity-epic {
    --ceremony-color: #ffcc00;
    --ceremony-glow: rgba(255, 204, 0, 0.5);
  }

  #chest-modal.jackpot {
    --ceremony-color: #ffd75e;
    --ceremony-glow: rgba(255, 215, 94, 0.5);
  }

  /* --- Rotating god-rays --- */
  .rays {
    position: absolute;
    inset: -60%;
    background: repeating-conic-gradient(
      from 0deg,
      transparent 0deg 12deg,
      var(--ceremony-glow) 12deg 15deg,
      transparent 15deg 30deg
    );
    opacity: 0.16;
    animation: rays-spin 24s linear infinite;
    pointer-events: none;
  }

  .rays-2 {
    animation-direction: reverse;
    animation-duration: 38s;
    opacity: 0.1;
  }

  .jackpot .rays {
    opacity: 0.3;
    animation-duration: 10s;
  }

  @keyframes rays-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* --- Pulsing core glow behind the panel --- */
  .core-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 70vmin;
    height: 70vmin;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, var(--ceremony-glow) 0%, transparent 65%);
    animation: glow-pulse 1.8s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes glow-pulse {
    50% {
      opacity: 0.55;
      transform: translate(-50%, -50%) scale(1.12);
    }
  }

  /* --- Per-reveal white flash --- */
  .flash {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 42%, var(--ceremony-glow), transparent 55%);
    animation: flash-out 0.45s ease-out both;
    pointer-events: none;
  }

  @keyframes flash-out {
    from {
      opacity: 0.9;
    }
    to {
      opacity: 0;
    }
  }

  /* --- Jackpot confetti --- */
  .confetti {
    position: absolute;
    top: -3vh;
    width: 8px;
    height: 14px;
    background: hsl(var(--hue), 95%, 62%);
    border-radius: 2px;
    animation: confetti-fall linear infinite both;
    pointer-events: none;
  }

  @keyframes confetti-fall {
    0% {
      transform: translate(0, -4vh) rotate3d(1, 1, 0, 0deg);
      opacity: 1;
    }
    100% {
      transform: translate(var(--drift), 106vh) rotate3d(1, 1, 0, 900deg);
      opacity: 0.8;
    }
  }

  /* --- Content --- */
  .content {
    position: relative;
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    text-align: center;
  }

  .content.shake-it {
    animation: panel-shake 0.3s ease-out;
  }

  @keyframes panel-shake {
    0%,
    100% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-4px, 2px);
    }
    50% {
      transform: translate(3px, -2px);
    }
    75% {
      transform: translate(-2px, 1px);
    }
  }

  /* --- Chest stage --- */
  .chest-stage {
    position: relative;
    height: 3.4rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .chest-icon {
    font-size: 2.6rem;
    filter: drop-shadow(0 0 14px var(--ceremony-glow));
  }

  .chest-icon.shaking {
    animation: chest-shake 0.45s ease-in-out infinite;
  }

  .chest-icon.opening {
    animation: chest-open-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes chest-shake {
    0%,
    100% {
      transform: rotate(0deg) scale(1);
    }
    25% {
      transform: rotate(-9deg) scale(1.07);
    }
    75% {
      transform: rotate(9deg) scale(1.07);
    }
  }

  @keyframes chest-open-pop {
    0% {
      transform: scale(1);
    }
    40% {
      transform: scale(1.35) rotate(-4deg);
    }
    100% {
      transform: scale(1);
    }
  }

  .chest-burst {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 1.4rem;
    color: var(--ceremony-color);
    animation: burst-fly 0.6s ease-out both;
    pointer-events: none;
  }

  @keyframes burst-fly {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.4);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(3.4) rotate(90deg);
    }
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    margin: 0.2rem 0 0;
    color: var(--ceremony-color);
    text-shadow: 0 0 20px var(--ceremony-glow);
  }

  .jackpot .title {
    animation: title-throb 0.8s ease-in-out infinite;
  }

  @keyframes title-throb {
    50% {
      transform: scale(1.06);
      text-shadow: 0 0 32px var(--ceremony-glow);
    }
  }

  .subtitle {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    color: var(--color-text-dim);
    margin-top: 0.4rem;
  }

  /* --- Reward cards --- */
  .rewards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    perspective: 700px;
  }

  .reward-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.7rem 1rem;
    border-radius: var(--r-md);
    min-height: 2.7rem;
    opacity: 0.35;
    overflow: hidden;
    border: 1px solid transparent;
    transition: opacity 0.2s ease;
  }

  .reward-row.revealed {
    opacity: 1;
    border-color: var(--ceremony-color);
    box-shadow:
      0 0 14px -4px var(--ceremony-glow),
      inset 0 0 20px -12px var(--ceremony-glow);
    animation: card-flip-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes card-flip-in {
    0% {
      transform: rotateX(80deg) scale(0.9);
      opacity: 0;
    }
    60% {
      transform: rotateX(-10deg) scale(1.04);
    }
    100% {
      transform: rotateX(0deg) scale(1);
      opacity: 1;
    }
  }

  /* Light sweep across a freshly revealed card */
  .reward-sheen {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 30%,
      rgba(255, 255, 255, 0.35) 48%,
      transparent 62%
    );
    transform: translateX(-110%);
    animation: sheen-sweep 0.9s ease-out 0.15s both;
    pointer-events: none;
  }

  @keyframes sheen-sweep {
    to {
      transform: translateX(110%);
    }
  }

  .reward-icon {
    width: 1.6rem;
    height: 1.6rem;
    display: inline-flex;
    filter: drop-shadow(0 0 6px var(--ceremony-glow));
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
    color: var(--ceremony-color);
  }

  .reward-mystery {
    width: 100%;
    font-size: 1rem;
    font-weight: 800;
    color: var(--color-text-dim);
    animation: mystery-blink 1s ease-in-out infinite;
  }

  @keyframes mystery-blink {
    50% {
      opacity: 0.35;
    }
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
    background: var(--ceremony-color);
    border-color: transparent;
    box-shadow: 0 0 18px -4px var(--ceremony-glow);
  }
</style>
