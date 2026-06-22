<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { fly } from 'svelte/transition';

  let hpPercent = $derived(
    Math.max(0, Math.min(100, (uiState.health.current / uiState.health.max) * 100)),
  );
  let xpPercent = $derived(Math.max(0, Math.min(100, (uiState.xp / uiState.xpMax) * 100)));
  let lowHealth = $derived(hpPercent <= 30);

  // Co-op: everyone in the party except ourselves (we already have the main HUD).
  let teammates = $derived(uiState.isMultiplayer ? uiState.party.filter((p) => !p.isLocal) : []);

  let minutes = $derived(
    Math.floor(uiState.gameTime / 60)
      .toString()
      .padStart(2, '0'),
  );
  let seconds = $derived(
    Math.floor(uiState.gameTime % 60)
      .toString()
      .padStart(2, '0'),
  );
  let timerText = $derived(`${minutes}:${seconds}`);

  function pauseGame() {
    setGameState('PAUSED');
  }

  // Flash gold on level-up
  let levelFlash = $state(false);
  let lastLevel = 1;
  $effect(() => {
    if (uiState.level > lastLevel) {
      levelFlash = true;
      setTimeout(() => (levelFlash = false), 900);
    }
    lastLevel = uiState.level;
  });
</script>

<div id="hud-overlay" class:hidden={uiState.gameState !== 'PLAYING'}>
  <!-- Damage feedback vignette (re-keyed per hit so the flash restarts) -->
  {#key uiState.damageFlash}
    <div class="vignette" class:low={lowHealth} class:flash={uiState.damageFlash > 0}></div>
  {/key}

  <!-- XP rail: hairline across the very top edge -->
  <div class="xp-rail">
    <div class="xp-fill" class:flash={levelFlash} style="width: {xpPercent}%"></div>
  </div>

  <!-- Top HUD: radar (left) · vitals (center) · pause (right) -->
  <div class="hud-top">
    <!-- Radar -->
    <div id="minimap-container" class="radar glass">
      <canvas id="minimap-canvas" width="150" height="150"></canvas>
      <span id="minimap-label" class="eyebrow">RADAR</span>
    </div>

    <!-- Vitals -->
    <div class="vitals">
      <div class="timer tnum" class:flash={levelFlash}>{timerText}</div>

      <div class="hp">
        <div class="hp-bar">
          <div class="hp-fill" class:low={lowHealth} style="width: {hpPercent}%"></div>
        </div>
        <span class="hp-val tnum" class:low={lowHealth}>{Math.ceil(hpPercent)}</span>
      </div>

      <div class="meta tnum">
        <span class="lv" class:flash={levelFlash}>LV{uiState.level}</span>
        <span class="dot">·</span>
        <span class="score">{uiState.score}</span>
        <span class="dot">·</span>
        <span class="kills">{uiState.kills}<i>k</i></span>
      </div>
    </div>

    <!-- Pause -->
    <button class="pause-btn glass" onclick={pauseGame} aria-label="Pause" title="Pause (ESC)">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      </svg>
    </button>
  </div>

  <!-- Co-op teammate roster: name + health for every other player -->
  {#if teammates.length > 0}
    <div class="party">
      {#each teammates as mate (mate.connectionId)}
        <div class="mate" class:dead={mate.hp <= 0}>
          <div class="mate-head">
            <span class="mate-name">{mate.name}</span>
            <span class="mate-lv tnum">LV{mate.level}</span>
          </div>
          <div class="mate-hp">
            <div
              class="mate-hp-fill"
              class:low={mate.maxHp > 0 && mate.hp / mate.maxHp <= 0.3}
              style="width: {mate.maxHp > 0
                ? Math.max(0, Math.min(100, (mate.hp / mate.maxHp) * 100))
                : 0}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Boss bar -->
  {#if uiState.bossHealth.active}
    <div class="boss" transition:fly={{ y: -16, duration: 350 }}>
      <div class="boss-head">
        <span class="eyebrow">⚠ SYSTEM CORRUPTION</span>
      </div>
      <div class="boss-bar">
        <div
          class="boss-fill"
          style="width: {(uiState.bossHealth.current / uiState.bossHealth.max) * 100}%"
        ></div>
      </div>
    </div>
  {/if}
</div>

<style>
  #hud-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 120;
    font-family: var(--font-body);
  }

  /* ---- Co-op party roster ---- */
  .party {
    position: absolute;
    left: max(0.75rem, var(--safe-left, 0px));
    top: 8.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 150px;
    pointer-events: none;
  }
  .mate {
    background: rgba(8, 12, 22, 0.55);
    border: 1px solid var(--color-border);
    border-radius: var(--r-sm);
    padding: 0.35rem 0.5rem;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .mate.dead {
    opacity: 0.45;
    filter: grayscale(0.8);
  }
  .mate-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.28rem;
  }
  .mate-name {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mate-lv {
    flex: 0 0 auto;
    font-size: 0.55rem;
    font-weight: 600;
    color: var(--color-text-dim);
  }
  .mate-hp {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .mate-hp-fill {
    height: 100%;
    background: var(--color-accent);
    transition: width 0.2s linear;
  }
  .mate-hp-fill.low {
    background: var(--color-primary);
  }

  .hidden {
    display: none !important;
  }

  /* ---- Damage vignette ---- */
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(ellipse at center, transparent 58%, rgba(255, 61, 119, 0.5) 100%);
  }
  .vignette.low {
    opacity: 0.3;
    animation: low-pulse 1.5s ease-in-out infinite;
  }
  .vignette.flash {
    animation: vignette-flash 0.4s ease-out;
  }
  .vignette.flash.low {
    animation:
      vignette-flash 0.4s ease-out,
      low-pulse 1.5s ease-in-out 0.4s infinite;
  }
  @keyframes vignette-flash {
    0% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes low-pulse {
    50% {
      opacity: 0.12;
    }
  }

  /* ---- XP rail ---- */
  .xp-rail {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.06);
  }
  .xp-fill {
    height: 100%;
    background: var(--color-gold);
    transition: width 0.3s ease;
  }
  .xp-fill.flash {
    box-shadow: 0 0 12px var(--color-gold);
  }

  /* ---- Top HUD bar ---- */
  .hud-top {
    position: absolute;
    top: calc(var(--safe-top) + 10px);
    left: calc(var(--safe-left) + 10px);
    right: calc(var(--safe-right) + 10px);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
    gap: var(--sp-3);
  }

  /* Radar (left) */
  .radar {
    justify-self: start;
    width: 70px;
    height: 70px;
    border-radius: var(--r-md);
    padding: 4px;
    position: relative;
    pointer-events: none;
    overflow: hidden;
  }
  #minimap-canvas {
    width: 100%;
    height: 100%;
    border-radius: var(--r-sm);
    display: block;
    background: rgba(0, 0, 0, 0.35);
  }
  #minimap-label {
    position: absolute;
    bottom: 5px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.4rem;
    color: var(--color-primary);
    text-shadow: 0 1px 3px #000;
  }

  /* Vitals (center) */
  .vitals {
    justify-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .timer {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.04em;
    color: var(--color-text-main);
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
    transition: color 0.3s ease;
  }
  .timer.flash {
    color: var(--color-gold);
  }
  .hp {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: min(58vw, 240px);
  }
  .hp-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: var(--r-pill);
    overflow: hidden;
  }
  .hp-fill {
    height: 100%;
    border-radius: var(--r-pill);
    background: linear-gradient(90deg, var(--color-primary-dim), var(--color-primary));
    transition:
      width 0.25s ease,
      background 0.3s ease;
  }
  .hp-fill.low {
    background: linear-gradient(90deg, #b3315a, var(--color-secondary));
    animation: hp-pulse 0.9s ease-in-out infinite;
  }
  @keyframes hp-pulse {
    50% {
      opacity: 0.55;
    }
  }
  .hp-val {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--color-text-dim);
    min-width: 22px;
    text-align: right;
  }
  .hp-val.low {
    color: var(--color-secondary);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.62rem;
    font-weight: 500;
    color: var(--color-text-dim);
  }
  .meta .lv {
    color: var(--color-gold);
    font-weight: 700;
  }
  .meta .lv.flash {
    text-shadow: 0 0 10px var(--color-gold);
  }
  .meta .score {
    color: var(--color-primary);
  }
  .meta .kills i {
    font-style: normal;
    color: var(--color-text-faint);
  }
  .meta .dot {
    color: var(--color-text-faint);
  }

  /* Pause (right) */
  .pause-btn {
    justify-self: end;
    width: 42px;
    height: 42px;
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-main);
    cursor: pointer;
    pointer-events: auto !important;
    transition: all var(--transition-fast);
  }
  .pause-btn:hover {
    border-color: var(--color-border-bright);
  }
  .pause-btn:active {
    transform: scale(0.92);
  }

  /* ---- Boss bar ---- */
  .boss {
    position: absolute;
    top: calc(var(--safe-top) + 92px);
    left: 50%;
    transform: translateX(-50%);
    width: min(86vw, 420px);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .boss-head {
    text-align: center;
  }
  .boss-head .eyebrow {
    color: var(--color-secondary);
    animation: boss-pulse 1.2s ease-in-out infinite;
  }
  @keyframes boss-pulse {
    50% {
      opacity: 0.55;
    }
  }
  .boss-bar {
    height: 5px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: var(--r-pill);
    overflow: hidden;
  }
  .boss-fill {
    height: 100%;
    background: var(--color-secondary);
    border-radius: var(--r-pill);
    transition: width 0.3s ease;
  }

  /* Landscape / wide: nudge radar + give the timer room */
  @media (min-width: 700px) {
    .timer {
      font-size: 2.4rem;
    }
    .radar {
      width: 84px;
      height: 84px;
    }
  }
</style>
