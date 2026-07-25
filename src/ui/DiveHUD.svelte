<script lang="ts">
  // --- DIVE HUD ---
  // Pure-DOM overlay mounted while a breach dive is active. It is the ONLY
  // HUD on screen during a dive (App.svelte unmounts the arena HUD), so it
  // carries everything the player needs: the clock, the objective, their
  // health, and — critically — a radar.
  //
  // The radar is not decoration. The dive camera can only frame ~±13 world
  // units while objectives sit out to r=17, so without a bearing readout the
  // player simply wanders until the clock runs out. That was the single
  // biggest reason the dive read as "a mess": the objective was usually
  // off-screen with nothing pointing at it.
  import { uiState } from '../core/UIState.svelte.ts';
  import { ejectDive } from '../systems/BreachDiveSystem';

  const dive = $derived(uiState.dive);

  const traceRatio = $derived(dive ? Math.min(1, dive.trace / dive.traceMax) : 0);
  const critical = $derived(traceRatio >= 0.82);
  const hpRatio = $derived(dive ? Math.max(0, dive.health / dive.healthMax) : 1);

  // Trace colour band: cyan → amber → red as the clock burns down.
  function traceColor(t: number): string {
    if (t < 0.5) {
      const k = t / 0.5;
      return `rgb(${Math.round(54 + 201 * k)},${Math.round(230 - 46 * k)},${Math.round(255 - 178 * k)})`;
    }
    const k = (t - 0.5) / 0.5;
    return `rgb(255,${Math.round(184 - 123 * k)},${Math.round(77 - 16 * k)})`;
  }

  function clock(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`;
  }

  // Radar blips arrive packed as [nx, nz, kind, ...]; unpack for the template.
  const blips = $derived.by(() => {
    const raw = dive?.radar ?? [];
    const out: { x: number; y: number; kind: number }[] = [];
    for (let i = 0; i + 2 < raw.length; i += 3) {
      out.push({ x: raw[i], y: raw[i + 1], kind: raw[i + 2] });
    }
    return out;
  });

  const BLIP_COLOR = ['#ffd75e', '#ffffff', '#3dff9a', '#ff3d55'];

  /* Briefing shows for a few seconds at the start of each dive, keyed on the
     node so re-entering a different one briefs again. */
  let showBrief = $state(false);
  $effect(() => {
    const id = dive?.nodeId;
    if (!id) {
      showBrief = false;
      return;
    }
    showBrief = true;
    const t = setTimeout(() => (showBrief = false), 4200);
    return () => clearTimeout(t);
  });
</script>

{#if dive}
  <div class="dive-hud" style={`--bcolor:${dive.color};`}>
    <!-- Damage vignette — re-keyed per hit so the flash restarts -->
    <div class="hurt" class:on={dive.hurt > 0}></div>

    <!-- ---------- TOP: the clock ---------- -->
    <div class="top">
      <div class="clock-row">
        <div class="clock" class:crit={critical}>
          <span class="clock-num">{clock(dive.secondsLeft)}</span>
          <span class="clock-unit">s</span>
        </div>
        <div class="clock-meta">
          <div class="trace-label">
            <span>TRACE</span>
            <span class="trace-num">{Math.floor(traceRatio * 100)}%</span>
          </div>
          <div class="trace-bar" class:crit={critical}>
            <div
              class="trace-fill"
              style={`width:${traceRatio * 100}%;background:${traceColor(traceRatio)};`}
            ></div>
            <!-- Scrub floor: kills push trace back, but never past this tick -->
            <div
              class="trace-floor"
              style={`left:${Math.min(100, (dive.traceFloor / dive.traceMax) * 100)}%;`}
            ></div>
          </div>
        </div>
        <button class="eject" onclick={ejectDive} aria-label="Eject from dive"> EJECT </button>
      </div>

      <!-- ---------- Objective card ---------- -->
      <div class="obj">
        <div class="obj-head">
          <span class="obj-icon">{dive.icon}</span>
          <span class="obj-name">{dive.name}</span>
          <span class="obj-verb">{dive.verb}</span>
          <span class="sec" aria-label={`Security ${dive.security}`}>
            {#each [0, 1, 2, 3] as i (i)}
              <i class:lit={i < dive.security}></i>
            {/each}
          </span>
          {#if dive.overclock}<span class="oc">OC</span>{/if}
        </div>
        <div class="obj-stage">{dive.stage}</div>
        <div class="obj-text">{dive.objectiveText}</div>
        {#if dive.progressMax > 0}
          <div class="obj-bar">
            <div
              class="obj-bar-fill"
              style={`width:${Math.min(100, (dive.progress / dive.progressMax) * 100)}%;`}
            ></div>
          </div>
        {/if}
        {#if dive.note}
          <div class="obj-note">{dive.note}</div>
        {/if}
      </div>
    </div>

    <!-- ---------- Centre banner ---------- -->
    {#key dive.bannerSeq}
      {#if dive.banner}
        <div class="banner">{dive.banner}</div>
      {/if}
    {/key}

    <!-- ---------- BOTTOM: vitals + radar ---------- -->
    <div class="bottom">
      <div class="vitals">
        <div class="hp-label">
          <span>INTEGRITY</span>
          <span class="hp-num">{Math.max(0, Math.floor(dive.health))}</span>
        </div>
        <div class="hp-bar" class:low={hpRatio < 0.34}>
          <div class="hp-fill" style={`width:${hpRatio * 100}%;`}></div>
        </div>
        <div class="threats">
          <span class="ice-count" class:hot={dive.iceCount >= 45} class:swarm={dive.iceCount >= 90}>
            <span class="ice-dot"></span>
            {dive.iceCount} ICE
          </span>
          {#if dive.turretCount > 0}
            <span class="turret-count">
              <span class="turret-dot"></span>
              {dive.turretCount} GUN{dive.turretCount === 1 ? '' : 'S'}
            </span>
          {/if}
        </div>
      </div>

      <div class="radar" aria-hidden="true">
        <svg viewBox="-1.1 -1.1 2.2 2.2">
          <circle class="radar-rim" cx="0" cy="0" r="1" />
          <circle class="radar-mid" cx="0" cy="0" r="0.5" />
          <line class="radar-cross" x1="-1" y1="0" x2="1" y2="0" />
          <line class="radar-cross" x1="0" y1="-1" x2="0" y2="1" />
          {#each blips as b, i (i)}
            <circle
              cx={b.x}
              cy={b.y}
              r={b.kind === 3 ? 0.055 : 0.095}
              fill={BLIP_COLOR[b.kind] ?? '#fff'}
              class:pulse={b.kind === 1 || b.kind === 2}
            />
          {/each}
          <!-- The player is always the centre of the disc -->
          <circle class="radar-self" cx="0" cy="0" r="0.07" />
        </svg>
      </div>
    </div>

    <!-- Entry briefing. `dive.brief` was written by every verb in
         DiveVerbs.ts and then rendered nowhere, so a dive dropped you into an
         unfamiliar sub-scene with a one-word verb and no statement of what
         you were actually there to do. It rides the enter flash and clears
         itself. -->
    {#if showBrief && dive.brief}
      <div class="brief">
        <span class="brief-verb">{dive.verb}</span>
        <span class="brief-text">{dive.brief}</span>
      </div>
    {/if}

    {#if uiState.diveTransition}
      <div
        class="transition"
        class:enter={uiState.diveTransition === 'enter'}
        class:exit={uiState.diveTransition === 'exit'}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .dive-hud {
    position: fixed;
    inset: 0;
    z-index: var(--z-hud);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: calc(var(--safe-top) + 0.75rem) calc(var(--safe-right) + 0.9rem)
      calc(var(--safe-bottom) + 1rem) calc(var(--safe-left) + 0.9rem);
    color: #fff;
  }

  /* ---------- damage vignette ---------- */
  .hurt {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.25s ease-out;
    background: radial-gradient(ellipse at center, transparent 42%, rgba(255, 30, 60, 0.55) 100%);
  }
  .hurt.on {
    opacity: 1;
    transition: opacity 0.04s linear;
  }

  /* ---------- top ---------- */
  .top {
    width: min(94vw, 560px);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .clock-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .clock {
    display: flex;
    align-items: baseline;
    gap: 0.1rem;
    font-family: var(--font-heading);
    line-height: 1;
    color: #fff;
    text-shadow: 0 0 12px var(--bcolor);
  }
  .clock-num {
    font-size: 2.1rem;
    font-variant-numeric: tabular-nums;
  }
  .clock-unit {
    font-size: 0.8rem;
    opacity: 0.6;
  }
  .clock.crit {
    color: #ff3d55;
    text-shadow: 0 0 14px #ff3d55;
    animation: crit-pulse 0.55s steps(2) infinite;
  }
  @keyframes crit-pulse {
    50% {
      opacity: 0.5;
    }
  }

  .clock-meta {
    flex: 1;
    min-width: 0;
  }

  .trace-label {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    color: rgba(255, 255, 255, 0.72);
    margin-bottom: 0.18rem;
  }
  .trace-num {
    color: var(--bcolor);
    font-weight: 700;
  }

  .trace-bar {
    position: relative;
    height: 9px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
  }
  .trace-fill {
    height: 100%;
    box-shadow: 0 0 8px currentColor;
    transition: width 0.12s linear;
  }
  /* The scrub floor: trace can be pushed back by kills, but not past here. */
  .trace-floor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
  }
  .trace-bar.crit {
    animation: crit-pulse 0.55s steps(2) infinite;
  }

  .eject {
    pointer-events: auto;
    flex: none;
    /* Full tap target — bailing out mid-dive shouldn't need precision */
    min-height: var(--tap);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #ff8fa3;
    background: rgba(40, 6, 14, 0.72);
    border: 1px solid rgba(255, 61, 85, 0.55);
    border-radius: var(--r-sm);
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .eject:hover {
    background: rgba(70, 8, 20, 0.85);
    color: #fff;
  }

  /* ---------- objective card ---------- */
  .obj {
    border: 1px solid var(--bcolor);
    border-radius: 9px;
    background: rgba(6, 12, 20, 0.72);
    box-shadow: 0 0 20px color-mix(in srgb, var(--bcolor) 32%, transparent);
    padding: 0.45rem 0.75rem 0.6rem;
  }

  .obj-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-heading);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    color: var(--bcolor);
    text-shadow: 0 0 8px var(--bcolor);
  }
  .obj-icon {
    font-size: 1rem;
    filter: drop-shadow(0 0 6px var(--bcolor));
  }
  .obj-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .obj-verb {
    font-family: var(--font-mono);
    font-size: 0.52rem;
    letter-spacing: 0.16em;
    color: rgba(255, 255, 255, 0.6);
    text-shadow: none;
  }

  .sec {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }
  .sec i {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.16);
  }
  .sec i.lit {
    background: #ff3d55;
    box-shadow: 0 0 5px #ff3d55;
  }

  .oc {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    color: #ff3d77;
    text-shadow: 0 0 6px #ff3d77;
    animation: crit-pulse 0.9s steps(2) infinite;
  }

  .obj-stage {
    margin-top: 0.22rem;
    font-family: var(--font-heading);
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    color: #fff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.45);
  }
  .obj-text {
    margin-top: 0.1rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.86);
  }
  .obj-note {
    margin-top: 0.22rem;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    color: #ffd75e;
    text-shadow: 0 0 6px rgba(255, 215, 94, 0.6);
  }

  .obj-bar {
    margin-top: 0.4rem;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
  }
  .obj-bar-fill {
    height: 100%;
    background: var(--bcolor);
    box-shadow: 0 0 7px var(--bcolor);
    transition: width 0.14s ease-out;
  }

  /* ---------- banner ---------- */
  .banner {
    font-family: var(--font-heading);
    font-size: clamp(1.1rem, 4vw, 1.9rem);
    letter-spacing: 0.14em;
    text-align: center;
    color: #fff;
    text-shadow:
      0 0 18px var(--bcolor),
      0 0 40px var(--bcolor);
    animation: banner-in 2.6s ease-out forwards;
  }
  @keyframes banner-in {
    0% {
      opacity: 0;
      transform: scale(1.12);
    }
    12% {
      opacity: 1;
      transform: scale(1);
    }
    72% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* ---------- bottom ---------- */
  .bottom {
    width: min(94vw, 560px);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .vitals {
    flex: 1;
    min-width: 0;
    max-width: 320px;
  }
  .hp-label {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.56rem;
    letter-spacing: 0.16em;
    color: rgba(255, 255, 255, 0.72);
    margin-bottom: 0.18rem;
  }
  .hp-num {
    color: #4dff88;
    font-weight: 700;
  }
  .hp-bar {
    height: 10px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
  }
  .hp-fill {
    height: 100%;
    background: #4dff88;
    box-shadow: 0 0 9px #4dff88;
    transition: width 0.12s linear;
  }
  .hp-bar.low .hp-fill {
    background: #ff3d3d;
    box-shadow: 0 0 11px #ff3d3d;
  }

  .threats {
    margin-top: 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .ice-count,
  .turret-count {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.66);
    font-variant-numeric: tabular-nums;
  }
  .ice-dot,
  .turret-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff3d55;
    box-shadow: 0 0 6px #ff3d55;
  }
  .turret-dot {
    border-radius: 1px;
    background: #ffb84d;
    box-shadow: 0 0 6px #ffb84d;
  }
  .ice-count.hot {
    color: #ff8fa3;
  }
  /* The room is genuinely full — this should feel alarming. */
  .ice-count.swarm {
    color: #ff3d55;
    animation: crit-pulse 0.7s steps(2) infinite;
  }
  .turret-count {
    color: #ffd9a0;
  }

  /* ---------- radar ---------- */
  .radar {
    flex: none;
    width: clamp(84px, 22vw, 116px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: rgba(4, 9, 16, 0.68);
    border: 1px solid color-mix(in srgb, var(--bcolor) 55%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--bcolor) 30%, transparent);
    overflow: hidden;
  }
  .radar svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .radar-rim,
  .radar-mid {
    fill: none;
    stroke: rgba(255, 255, 255, 0.16);
    stroke-width: 0.018;
  }
  .radar-cross {
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 0.014;
  }
  .radar-self {
    fill: #7fe7ff;
    stroke: #fff;
    stroke-width: 0.025;
  }
  .radar circle.pulse {
    animation: blip-pulse 1.1s ease-in-out infinite;
  }
  @keyframes blip-pulse {
    50% {
      opacity: 0.35;
    }
  }

  /* ---------- entry briefing ---------- */
  .brief {
    position: absolute;
    left: 50%;
    top: 38%;
    transform: translateX(-50%);
    width: max-content;
    max-width: min(88vw, 30rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.85rem 1.2rem;
    border-radius: var(--r-lg);
    background: rgba(4, 10, 16, 0.82);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--bcolor);
    box-shadow: 0 0 30px -8px var(--bcolor);
    text-align: center;
    pointer-events: none;
    animation: brief-cycle 4.2s ease-out both;
  }
  .brief-verb {
    font-family: var(--font-heading);
    font-size: var(--fs-label);
    font-weight: 800;
    letter-spacing: 0.2em;
    color: var(--bcolor);
    text-shadow: 0 0 12px var(--bcolor);
  }
  .brief-text {
    font-size: var(--fs-caption);
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.86);
    text-wrap: balance;
  }
  @keyframes brief-cycle {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    9% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    82% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* ---------- transitions ---------- */
  .transition {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 95;
    background: transparent;
  }
  .transition.enter {
    animation: dive-enter 0.45s ease-out forwards;
  }
  .transition.exit {
    animation: dive-exit 0.45s ease-out forwards;
  }
  @keyframes dive-enter {
    0% {
      background: rgba(0, 255, 120, 0.55);
    }
    100% {
      background: transparent;
    }
  }
  @keyframes dive-exit {
    0% {
      background: transparent;
    }
    35% {
      background: rgba(255, 255, 255, 0.7);
    }
    100% {
      background: transparent;
    }
  }

  @media (max-width: 480px) {
    .clock-num {
      font-size: 1.6rem;
    }
    .obj-stage {
      font-size: 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .clock.crit,
    .trace-bar.crit,
    .oc,
    .ice-count.swarm,
    .radar circle.pulse {
      animation: none;
    }
  }
</style>
