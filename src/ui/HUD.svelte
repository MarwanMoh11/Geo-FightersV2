<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { fly } from 'svelte/transition';
  import BreachPrompt from './BreachPrompt.svelte';

  const isTouchDevice =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

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
  <!-- Off-screen POI guidance arrows (Phase 1.95 wayfinding) -->

  <!-- JACK IN door prompt (Phase 1.96) -->
  <BreachPrompt />

  <!-- Damage feedback vignette (re-keyed per hit so the flash restarts) -->
  {#key uiState.damageFlash}
    <div class="vignette" class:low={lowHealth} class:flash={uiState.damageFlash > 0}></div>
  {/key}

  <!-- Kill combo chain (appears from ×5 so it feels earned) -->
  {#if uiState.combo >= 5}
    <div class="combo" class:hot={uiState.combo >= 50} class:blazing={uiState.combo >= 100}>
      <span class="combo-count">×{uiState.combo}</span>
      <span class="combo-label">COMBO</span>
    </div>
  {/if}

  <!-- Big transient callout ("COMBO ×100", "ARMORY — VAULT CHEST RELEASED").
       Long strings are split on the em-dash into a bold headline + a smaller
       detail line, and both wrap within the viewport so nothing ever runs off
       the sides on a narrow phone. -->
  {#if uiState.callout}
    {#key uiState.calloutSeq}
      {@const parts = uiState.callout.split(' — ')}
      <div class="callout">
        <span class="callout-title">{parts[0]}</span>
        {#if parts.length > 1}
          <span class="callout-sub">{parts.slice(1).join(' — ')}</span>
        {/if}
      </div>
    {/key}
  {/if}

  <!-- Endless mode badge -->
  {#if uiState.endlessMode}
    <div class="endless-badge">∞ ENDLESS</div>
  {/if}

  <!-- XP rail: hairline across the very top edge -->
  <div class="xp-rail">
    <div class="xp-fill" class:flash={levelFlash} style="width: {xpPercent}%"></div>
  </div>

  <!-- Top HUD: vitals (center) · pause (right). The radar minimap was
       retired with THE PIT — a 140-unit arena IS its own minimap, and the
       reclaimed corner is premium space on phones. -->
  <div class="hud-top">
    <!-- Spacer keeps the vitals centered in the 1fr/auto/1fr grid -->
    <div class="hud-spacer" aria-hidden="true"></div>

    <!-- Vitals -->
    <div class="vitals">
      <div class="timer tnum" class:flash={levelFlash}>{timerText}</div>

      <div class="hp">
        <div class="hp-bar">
          <div class="hp-fill" class:low={lowHealth} style="width: {hpPercent}%"></div>
        </div>
        <span class="hp-val tnum" class:low={lowHealth}
          >{Math.max(0, Math.ceil(uiState.health.current))}/{Math.round(uiState.health.max)}</span
        >
      </div>

      <!-- Overload Charge Core -->
      <div
        class="overload"
        class:ready={uiState.overloadCharge >= 100}
        class:active={uiState.overloadActive}
      >
        <div class="overload-bar">
          <div
            class="overload-fill"
            style="width: {uiState.overloadActive
              ? (uiState.overloadTimer / 7) * 100
              : uiState.overloadCharge}%"
          ></div>
        </div>
        <!-- Label only when it matters — the filling bar speaks for itself -->
        {#if uiState.overloadActive || uiState.overloadCharge >= 100}
          <div class="overload-meta">
            {#if uiState.overloadActive}
              <span class="overload-text active-pulse"
                >🔥 OVERLOAD: {Math.ceil(uiState.overloadTimer)}s</span
              >
            {:else}
              <span class="overload-text ready-glow"
                >⚡ OVERCLOCK READY{isTouchDevice ? '' : ' — SPACE'}</span
              >
            {/if}
          </div>
        {/if}
      </div>

      <div class="meta tnum">
        <span class="lv" class:flash={levelFlash}>LV{uiState.level}</span>
        <span class="dot">·</span>
        <span class="kills">{uiState.kills}<i>k</i></span>
        <span class="dot">·</span>
        <span class="credits">🪙 {uiState.creditsCollected}</span>
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

  <!-- Co-op transport indicator: direct P2P (with measured ping) vs relay -->
  {#if uiState.isMultiplayer}
    <div
      class="net-chip"
      class:p2p={uiState.netTransport === 'p2p'}
      class:mixed={uiState.netTransport === 'mixed'}
      title={uiState.netTransport === 'relay'
        ? 'Traffic routed through the signaling server'
        : 'Direct peer-to-peer connection'}
    >
      {#if uiState.netTransport === 'relay'}
        ☁ RELAY
      {:else}
        ⚡ {uiState.netTransport === 'mixed' ? 'MIXED' : 'P2P'}{uiState.netRtt >= 0
          ? ` · ${uiState.netRtt}ms`
          : ''}
      {/if}
    </div>
  {/if}

  <!-- Co-op teammate roster: name, health, kills; DOWN + revive channel -->
  {#if teammates.length > 0}
    <div class="party">
      {#each teammates as mate (mate.connectionId)}
        <div class="mate" class:dead={mate.dead || mate.hp <= 0}>
          <div class="mate-head">
            <span class="mate-name">{mate.name}</span>
            <span class="mate-kills tnum">☠{mate.kills}</span>
            <span class="mate-lv tnum">LV{mate.level}</span>
          </div>
          {#if mate.dead || mate.hp <= 0}
            <div class="mate-down">
              <span class="down-label">{mate.revivePct > 0 ? 'REVIVING' : 'DOWN'}</span>
              <div class="mate-revive">
                <div class="mate-revive-fill" style="width: {mate.revivePct}%"></div>
              </div>
            </div>
          {:else}
            <div class="mate-hp">
              <div
                class="mate-hp-fill"
                class:low={mate.maxHp > 0 && mate.hp / mate.maxHp <= 0.3}
                style="width: {mate.maxHp > 0
                  ? Math.max(0, Math.min(100, (mate.hp / mate.maxHp) * 100))
                  : 0}%"
              ></div>
            </div>
          {/if}
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

  .net-chip {
    position: absolute;
    left: max(0.75rem, var(--safe-left, 0px));
    top: 7.1rem;
    width: 150px;
    box-sizing: border-box;
    padding: 0.22rem 0.5rem;
    border-radius: var(--r-pill);
    border: 1px solid var(--color-border);
    background: rgba(0, 0, 0, 0.35);
    font-size: 0.52rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--color-text-dim);
    text-align: center;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .net-chip.p2p {
    color: #00ff88;
    border-color: rgba(0, 255, 136, 0.35);
  }
  .net-chip.mixed {
    color: #ffd75e;
    border-color: rgba(255, 215, 94, 0.35);
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
  .mate-kills {
    flex: 0 0 auto;
    font-size: 0.55rem;
    font-weight: 700;
    color: var(--color-text-dim);
  }
  .mate-down {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .down-label {
    font-size: 0.5rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--color-secondary);
  }
  .mate-revive {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .mate-revive-fill {
    height: 100%;
    background: #00ff88;
    transition: width 0.15s linear;
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

  .hud-spacer {
    justify-self: start;
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
    min-width: 44px;
    text-align: right;
    white-space: nowrap;
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
  .meta .kills i {
    font-style: normal;
    color: var(--color-text-faint);
  }
  .meta .credits {
    color: var(--color-gold);
    font-weight: 700;
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

  /* Landscape / wide: give the timer room */
  @media (min-width: 700px) {
    .timer {
      font-size: 2.4rem;
    }
  }

  /* ---- Overload Core Meter ---- */
  .overload {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: min(58vw, 240px);
    margin-top: 1px;
    align-items: center;
  }
  .overload-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--r-pill);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.03);
  }
  .overload-fill {
    height: 100%;
    background: linear-gradient(90deg, #0055ff, #00d5ff);
    transition: width 0.15s linear;
  }
  .overload.ready .overload-fill {
    background: linear-gradient(90deg, #00ff88, #00ffff);
    box-shadow: 0 0 8px #00ffff;
  }
  .overload.active .overload-fill {
    background: linear-gradient(90deg, #ff0055, #ffaa00);
    box-shadow: 0 0 10px #ffaa00;
  }
  .overload-meta {
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
  }
  .overload-text {
    display: inline-block;
  }
  .ready-glow {
    color: #00ff88;
    text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
    animation: text-pulse 1s ease-in-out infinite;
  }
  .active-pulse {
    color: #ffaa00;
    text-shadow: 0 0 10px rgba(255, 170, 0, 0.8);
    animation: text-pulse 0.6s ease-in-out infinite;
  }
  @keyframes text-pulse {
    50% {
      opacity: 0.6;
    }
  }

  /* --- Kill combo chain --- */
  .combo {
    position: absolute;
    top: calc(var(--safe-top) + 120px);
    right: 14px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    pointer-events: none;
    animation: combo-pop 0.15s ease-out;
  }
  @keyframes combo-pop {
    from {
      transform: scale(1.25);
    }
    to {
      transform: scale(1);
    }
  }
  .combo-count {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-primary);
    text-shadow: 0 0 12px rgba(0, 213, 255, 0.6);
    font-variant-numeric: tabular-nums;
  }
  .combo-label {
    font-size: 0.52rem;
    font-weight: 800;
    letter-spacing: 0.24em;
    color: var(--color-text-dim);
  }
  .combo.hot .combo-count {
    color: #ffaa00;
    text-shadow: 0 0 14px rgba(255, 170, 0, 0.7);
  }
  .combo.blazing .combo-count {
    color: #ff3355;
    text-shadow: 0 0 18px rgba(255, 51, 85, 0.8);
    animation: text-pulse 0.4s ease-in-out infinite;
  }

  /* --- Big transient callout --- */
  .callout {
    position: absolute;
    top: 26%;
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: min(92vw, 32rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15em;
    text-align: center;
    pointer-events: none;
    animation: callout-cycle 2.2s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .callout-title {
    font-family: var(--font-heading);
    font-size: clamp(1.05rem, 4.4vw, 1.8rem);
    font-weight: 800;
    letter-spacing: 0.1em;
    line-height: 1.05;
    color: var(--color-text-main);
    text-shadow: 0 0 20px rgba(0, 213, 255, 0.5);
    text-wrap: balance;
  }
  .callout-sub {
    font-family: var(--font-body);
    font-size: clamp(0.62rem, 2.7vw, 0.9rem);
    font-weight: 700;
    letter-spacing: 0.16em;
    line-height: 1.15;
    color: var(--color-primary);
    text-shadow: 0 0 12px rgba(0, 213, 255, 0.4);
    text-wrap: balance;
  }
  @keyframes callout-cycle {
    0% {
      opacity: 0;
      transform: translateX(-50%) scale(1.4);
    }
    12% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) scale(0.96);
    }
  }

  /* --- Endless badge --- */
  .endless-badge {
    position: absolute;
    top: calc(var(--safe-top) + 64px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: #3cffaa;
    text-shadow: 0 0 10px rgba(60, 255, 170, 0.6);
    pointer-events: none;
    animation: text-pulse 1.6s ease-in-out infinite;
  }
</style>
