<script lang="ts">
  // --- DIVE HUD (chunk5) ---
  // Pure-DOM HUD mounted while a breach dive is active. Reads uiState.dive
  // reactively. Mirrors the styling conventions of BreachOverlay (CSS vars,
  // --font-heading / --font-mono, neon text-shadow, pointer-events: none)
  // so the dive feels like the same visual language.
  import { uiState } from '../core/UIState.svelte.ts';

  const dive = $derived(uiState.dive);

  // Trace color band: cyan → amber → red as it climbs. Saturated at 1.0.
  function traceColor(t: number): string {
    if (t < 0.5) {
      const k = t / 0.5;
      // cyan (54,230,255) → amber (255,184,77)
      const r = Math.round(54 + (255 - 54) * k);
      const g = Math.round(230 + (184 - 230) * k);
      const b = Math.round(255 + (77 - 255) * k);
      return `rgb(${r},${g},${b})`;
    }
    const k = (t - 0.5) / 0.5;
    const r = Math.round(255 + (255 - 255) * k);
    const g = Math.round(184 + (61 - 184) * k);
    const b = Math.round(77 + (61 - 77) * k);
    return `rgb(${r},${g},${b})`;
  }
</script>

{#if dive}
  <div class="dive-hud" style={`--bcolor:${dive.color};`}>
    <div class="dive-top">
      <div class="dive-trace">
        <div class="dive-trace-label">
          <span>TRACE</span>
          <span class="dive-trace-num">{Math.floor(dive.trace)} / {dive.traceMax}</span>
        </div>
        <div class="dive-trace-bar" class:crit={dive.trace >= dive.traceMax * 0.9}>
          <div
            class="dive-trace-fill"
            style={`width:${Math.min(100, (dive.trace / dive.traceMax) * 100)}%;background:${traceColor(dive.trace / dive.traceMax)};`}
          ></div>
        </div>
      </div>

      <div class="dive-hp">
        <div class="dive-hp-label">
          <span>HP</span>
          <span class="dive-hp-num">{Math.max(0, Math.floor(dive.health))} / {dive.healthMax}</span>
        </div>
        <div class="dive-hp-bar" class:low={dive.health / dive.healthMax < 0.3}>
          <div
            class="dive-hp-fill"
            style={`width:${Math.max(0, (dive.health / dive.healthMax) * 100)}%;`}
          ></div>
        </div>
      </div>

      <div class="dive-objective">
        <div class="dive-obj-head">
          <span class="dive-obj-icon">{dive.icon}</span>
          <span class="dive-obj-name">{dive.name}</span>
          {#if dive.overclock}<span class="dive-obj-oc">OVERCLOCK</span>{/if}
        </div>
        <div class="dive-obj-stage">{dive.verbStage}</div>
        <div class="dive-obj-text">{dive.objectiveText}</div>
        {#if dive.progressMax > 0}
          <div class="dive-obj-bar">
            <div
              class="dive-obj-bar-fill"
              style={`width:${Math.min(100, (dive.progress / dive.progressMax) * 100)}%;`}
            ></div>
          </div>
        {/if}
      </div>
    </div>

    <div class="dive-exit">ESC: EJECT — BAILING SPAWNS AMBUSH</div>

    {#if uiState.diveTransition}
      <div
        class="dive-transition"
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
    z-index: 80;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.2rem 1.2rem;
    color: #fff;
  }

  .dive-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: min(92vw, 520px);
  }

  .dive-trace,
  .dive-hp {
    width: 100%;
  }

  .dive-trace-label,
  .dive-hp-label {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: rgba(255, 255, 255, 0.78);
    text-shadow: 0 0 6px var(--bcolor);
    margin-bottom: 0.18rem;
  }

  .dive-trace-num,
  .dive-hp-num {
    color: var(--bcolor);
    font-weight: 700;
  }

  .dive-trace-bar,
  .dive-hp-bar {
    position: relative;
    height: 9px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .dive-trace-fill {
    height: 100%;
    background: #36e6ff;
    box-shadow: 0 0 8px currentColor;
    transition: width 0.12s linear;
  }

  .dive-trace-bar.crit {
    animation: trace-crit-pulse 0.6s steps(2) infinite;
  }
  @keyframes trace-crit-pulse {
    50% {
      filter: brightness(1.5);
    }
  }

  .dive-hp-fill {
    height: 100%;
    background: #4dff88;
    box-shadow: 0 0 8px #4dff88;
    transition: width 0.12s linear;
  }
  .dive-hp-bar.low .dive-hp-fill {
    background: #ff3d3d;
    box-shadow: 0 0 10px #ff3d3d;
  }

  .dive-objective {
    width: 100%;
    margin-top: 0.3rem;
    border: 1px solid var(--bcolor);
    border-radius: 8px;
    background: rgba(6, 12, 20, 0.6);
    box-shadow: 0 0 18px color-mix(in srgb, var(--bcolor) 35%, transparent);
    padding: 0.45rem 0.7rem 0.55rem;
  }

  .dive-obj-head {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-family: var(--font-heading);
    font-size: 0.95rem;
    letter-spacing: 0.12em;
    color: var(--bcolor);
    text-shadow: 0 0 8px var(--bcolor);
  }
  .dive-obj-icon {
    font-size: 1.1rem;
    filter: drop-shadow(0 0 6px var(--bcolor));
  }
  .dive-obj-oc {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: #ff3d77;
    text-shadow: 0 0 6px #ff3d77;
    animation: oc-blink 0.9s steps(2) infinite;
  }
  @keyframes oc-blink {
    50% {
      opacity: 0.45;
    }
  }

  .dive-obj-stage {
    margin-top: 0.18rem;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.16em;
    color: #ffd75e;
    text-shadow: 0 0 6px rgba(255, 215, 94, 0.7);
  }

  .dive-obj-text {
    margin-top: 0.18rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.92);
  }

  .dive-obj-bar {
    margin-top: 0.4rem;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .dive-obj-bar-fill {
    height: 100%;
    background: var(--bcolor);
    box-shadow: 0 0 6px var(--bcolor);
    transition: width 0.12s linear;
  }

  .dive-exit {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.6);
    background: rgba(4, 8, 14, 0.55);
    border: 1px solid rgba(255, 61, 119, 0.4);
    border-radius: 4px;
    padding: 0.32rem 0.7rem;
    text-align: center;
  }

  .dive-transition {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 95;
    background: transparent;
  }
  .dive-transition.enter {
    animation: dive-enter 0.4s ease-out forwards;
  }
  .dive-transition.exit {
    animation: dive-exit 0.4s ease-out forwards;
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

  @media (prefers-reduced-motion: reduce) {
    .dive-trace-bar.crit,
    .dive-obj-oc {
      animation: none;
    }
  }
</style>
