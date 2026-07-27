<script lang="ts">
  // --- BREACH OVERLAY: the JACK IN mini-game shell (Phase 1.96 → 2.0) ---
  // Owns the frame every hack shares — header, countdown, co-op shield,
  // eject — and mounts one of FOUR games chosen by node kind:
  //
  //   GRID RUNNER    maze + antivirus chasers (bank / stash-den fog)
  //   CRACK TIMER    lock-picking dial, shrinking arcs (armory / stash den)
  //   CODE CASCADE   glyph memory, shuffling keypad (depot / relay)
  //   CIRCUIT ROUTE  rotate conduits, ICE re-scrambles (substation / relay)
  //
  // Two kinds roll a coin between two games so repeat visits stay fresh.
  // Every game is tap-native (pointer events, no keyboard required) and
  // security 0-3 scales its parameters. Reports back via resolveBreach().
  import { onMount } from 'svelte';
  import { uiState, saveLocal } from '../core/UIState.svelte.ts';
  import { resolveBreach } from '../systems/BreachSystem';
  import { playMenuClick } from '../core/audio';
  import { haptics } from '../core/haptics';
  import GridRunner from './breach/GridRunner.svelte';
  import CrackTimer from './breach/CrackTimer.svelte';
  import CodeCascade from './breach/CodeCascade.svelte';
  import CircuitRoute from './breach/CircuitRoute.svelte';
  import TutorialDemo from './breach/TutorialDemo.svelte';

  const breach = uiState.breach!;
  const kind = breach.kind;
  const sec = breach.security;
  const isCypher = uiState.selectedCharacter === 'cypher';
  const isByte = uiState.selectedCharacter === 'byte';

  // --- GAME PICK ---
  type GameId = 'runner' | 'crack' | 'cascade' | 'route';
  interface GamePlan {
    game: GameId;
    variant: string;
  }
  function pickGame(): GamePlan {
    switch (kind) {
      case 'depot':
        return { game: 'cascade', variant: 'plain' };
      case 'armory':
        return { game: 'crack', variant: 'plain' };
      case 'bank':
        return { game: 'runner', variant: 'chase' };
      case 'substation':
        return { game: 'route', variant: 'plain' };
      case 'stashden':
        return Math.random() < 0.5
          ? { game: 'runner', variant: 'fog' }
          : { game: 'crack', variant: 'decoy' };
      case 'relay':
        return Math.random() < 0.5
          ? { game: 'cascade', variant: 'shuffle' }
          : { game: 'route', variant: 'corrupt' };
      default:
        return { game: 'runner', variant: 'chase' };
    }
  }
  const plan = pickGame();

  const GAME_NAMES: Record<GameId, string> = {
    runner: 'GRID RUNNER',
    crack: 'CRACK TIMER',
    cascade: 'CODE CASCADE',
    route: 'CIRCUIT ROUTE',
  };
  const GAME_HINTS: Record<GameId, string> = {
    runner: 'REACH THE GREEN EXIT — SWIPE / D-PAD / WASD',
    crack: 'TAP WHEN THE NEEDLE IS IN THE GLOWING ARC — AVOID RED',
    cascade: 'WATCH THE GLYPHS, THEN TAP THEM BACK IN ORDER',
    route: 'TAP CONDUITS TO ROTATE — BRIDGE ⚡ TO ◉',
  };

  /* First-time rules card.
     Four different mini-games, each with rules you cannot infer, previously
     explained by one line of 10px footer text while the trace clock was
     already running. Each game now teaches itself once, with the clock held,
     and never interrupts again. */
  /* The demo above carries the mechanic; the text is reduced to one
     imperative goal and one consequence. Anything longer competes with the
     animation for attention and loses. */
  interface Rules {
    goal: string;
    warn: string;
  }
  const GAME_RULES: Record<GameId, Rules> = {
    runner: {
      goal: 'Swipe to reach the green exit.',
      warn: 'Red antivirus nodes hunt you. One touch ends the breach.',
    },
    crack: {
      goal: 'Tap when the needle crosses the lit arc.',
      warn: 'Missing the arc costs you time.',
    },
    cascade: {
      goal: 'Watch the glyphs, then tap them back in order.',
      warn: 'A wrong glyph costs time and replays the code.',
    },
    route: {
      goal: 'Tap conduits to rotate them and connect ⚡ to ◉.',
      warn: 'On corrupted nodes, ICE re-scrambles tiles while you work.',
    },
  };

  const RULES_KEY = `geo_breach_rules_${plan.game}`;
  const rulesSeen =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return localStorage.getItem(RULES_KEY) === '1';
      } catch {
        return false;
      }
    })();

  /* First time with this game, the demo is followed by live coaching on the
     real board — pulsing the exact thing to act on — because a demo teaches
     the shape of the action and the board teaches where it lives. */
  const coach = !rulesSeen;

  function dismissRules(): void {
    playMenuClick();
    haptics.select();
    saveLocal(RULES_KEY, '1');
    phase = 'intro';
  }

  // --- TIME BUDGET ---
  const RUNNER_TIME: Record<string, number> = {
    depot: 22,
    armory: 26,
    bank: 21,
    relay: 23,
    substation: 14,
    stashden: 24,
  };
  const GAME_TIME: Record<GameId, number> = {
    runner: RUNNER_TIME[kind] ?? 22,
    crack: 20,
    cascade: 26,
    route: 34,
  };
  const timeLimit =
    GAME_TIME[plan.game] *
    (sec === 0 ? 1.5 : sec === 2 ? 0.85 : sec === 3 ? 0.72 : 1) *
    (breach.overclock ? 0.7 : 1) *
    (isCypher ? 1.25 : 1); // CYPHER: born in the grid

  let timeLeft = $state(timeLimit);
  // 'rules' holds the clock at zero elapsed until the player says go.
  let phase = $state<'rules' | 'intro' | 'run' | 'done'>(rulesSeen ? 'intro' : 'rules');
  let resultText = $state('');
  let resultClass = $state('');
  let flashMsg = $state('');
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function flash(msg: string): void {
    flashMsg = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashMsg = ''), 1400);
  }

  function penalty(seconds: number): void {
    timeLeft = Math.max(0.01, timeLeft - seconds);
  }

  function finish(outcome: 'win' | 'fail' | 'abort'): void {
    if (phase === 'done') return;
    phase = 'done';
    if (outcome === 'win') {
      resultText = 'ACCESS GRANTED';
      resultClass = 'win';
    } else if (outcome === 'fail') {
      resultText = 'TRACE DETECTED';
      resultClass = 'fail';
    } else {
      resultText = 'EJECTED';
      resultClass = 'fail';
    }
    setTimeout(() => resolveBreach(outcome), outcome === 'win' ? 700 : 850);
  }

  const win = () => finish('win');
  const fail = () => finish('fail');

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish('abort');
    }
  }

  /* The "JACKING IN…" beat runs whenever we enter `intro` — which is on
     mount for a familiar game, or the moment the rules card is dismissed for
     a first-timer. A plain onMount timer only covered the first case and
     left anyone reading the rules stuck on the splash. */
  $effect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => {
      if (phase === 'intro') phase = 'run';
    }, 900);
    return () => clearTimeout(t);
  });

  onMount(() => {
    window.addEventListener('keydown', onKeyDown, true);

    let last = performance.now();
    let raf = requestAnimationFrame(function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (phase !== 'run') return;
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        finish('fail');
      }
    });

    return () => {
      clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  });
</script>

<div class="breach-backdrop">
  <div
    class="breach-panel"
    class:panel-rules={phase === 'rules'}
    style={`--bcolor:${breach.color};`}
  >
    <header class="b-head">
      <span class="b-icon">{breach.icon}</span>
      <div class="b-title">
        <div class="b-name">{breach.name}</div>
        <div class="b-sub">
          {GAME_NAMES[plan.game]} ·
          {#if sec === 0}
            SECURITY ZERO
          {:else}
            SECURITY {'▮'.repeat(sec)}{'▯'.repeat(3 - sec)}
          {/if}
          {#if breach.overclock}<span class="oc">OVERCLOCK ×2</span>{/if}
        </div>
      </div>
      <button class="b-quit" onpointerdown={() => finish('abort')} aria-label="Eject from breach">
        <span class="b-quit-label">EJECT</span>
        <span aria-hidden="true">✕</span>
      </button>
    </header>

    <div class="b-timer">
      <div
        class="b-timer-fill"
        class:hot={timeLeft / timeLimit < 0.3}
        style={`width:${(timeLeft / timeLimit) * 100}%`}
      ></div>
    </div>
    {#if uiState.isMultiplayer}
      <div class="b-shield">
        <div
          class="b-shield-fill"
          style={`width:${Math.max(0, uiState.breachShield) * 100}%`}
        ></div>
        <span class="b-shield-label">SHIELD — TEAM MUST HOLD THE DOOR</span>
      </div>
    {/if}

    <div class="b-stage" class:stage-hidden={phase === 'rules'}>
      {#if plan.game === 'runner'}
        <GridRunner
          {sec}
          {coach}
          overclock={breach.overclock}
          mercy={isByte}
          running={phase === 'run'}
          variant={plan.variant === 'fog' ? 'fog' : 'chase'}
          {win}
          {fail}
          {flash}
        />
      {:else if plan.game === 'crack'}
        <CrackTimer
          {sec}
          {coach}
          overclock={breach.overclock}
          mercy={isByte}
          running={phase === 'run'}
          decoys={plan.variant === 'decoy'}
          {win}
          {flash}
          {penalty}
        />
      {:else if plan.game === 'cascade'}
        <CodeCascade
          {sec}
          {coach}
          overclock={breach.overclock}
          mercy={isByte}
          running={phase === 'run'}
          shuffle={plan.variant === 'shuffle'}
          {win}
          {flash}
          {penalty}
        />
      {:else}
        <CircuitRoute
          {sec}
          {coach}
          overclock={breach.overclock}
          mercy={isByte}
          running={phase === 'run'}
          corrupt={plan.variant === 'corrupt'}
          {win}
          {flash}
        />
      {/if}

      {#if phase === 'intro'}
        <div class="b-splash">JACKING IN…</div>
      {:else if phase === 'done'}
        <div class="b-splash {resultClass}">{resultText}</div>
      {/if}
      {#if flashMsg}<div class="b-flash">{flashMsg}</div>{/if}
    </div>

    <footer class="b-foot">
      {GAME_HINTS[plan.game]}<span class="pointer-only">&nbsp;• ESC EJECTS</span>
    </footer>

    <!-- Rules overlay covers the WHOLE panel, not just the game stage: the
         stage is locked to the game's own aspect ratio (13:9), which on a
         phone is far too short to hold a demo plus its caption without
         clipping the top of the card. -->
    {#if phase === 'rules'}
      {@const r = GAME_RULES[plan.game]}
      <div class="b-rules menu-scroll">
        <div class="b-rules-card">
          <!-- The demo does the teaching: a looping miniature of the real
               mechanic with a ghost finger showing the exact action. -->
          <TutorialDemo game={plan.game} />
          <div class="b-rules-copy">
            <h3 class="b-rules-title">{GAME_NAMES[plan.game]}</h3>
            <p class="b-rules-goal">{r.goal}</p>
            <p class="b-rules-warn"><span aria-hidden="true">⚠</span> {r.warn}</p>
            <button class="b-rules-go" onclick={dismissRules}>Start breach</button>
            <p class="b-rules-foot">The clock starts when you tap.</p>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .breach-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    /* Column + `margin:auto` on the panel rather than `align-items:center`:
       a centred flex item taller than its container overflows in BOTH
       directions and can't be scrolled back into view. On a landscape phone
       that put the Start button — and the eject control — off-screen. */
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    /* pan-y, not none: GridRunner preventDefaults its own touchmove so swipe
       -to-move still wins, and the other three games are pointerdown-only. */
    touch-action: pan-y;
    overscroll-behavior: contain;
    padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: rgba(3, 7, 13, 0.82);
    backdrop-filter: blur(2px);
  }

  .breach-panel {
    /* Positioning context for the full-panel rules overlay */
    position: relative;
    /* The 3rd term keeps the game's 13:9 stage from outgrowing a short
       viewport before scrolling is even needed. */
    width: min(94vw, 580px, 82vh);
    margin: auto;
    flex: 0 0 auto;
  }
  /* While the rules show, the stage is collapsed — so the 13:9 height cap
     that the third term exists for doesn't apply and the card can use the
     full comfortable width. */
  .breach-panel.panel-rules {
    width: min(94vw, 580px);
    border: 1px solid var(--bcolor);
    border-radius: 12px;
    background: rgba(6, 12, 20, 0.96);
    box-shadow:
      0 0 26px color-mix(in srgb, var(--bcolor) 40%, transparent),
      inset 0 0 60px rgba(0, 0, 0, 0.55);
    padding: 0.7rem 0.8rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .b-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .b-icon {
    font-size: 1.5rem;
    filter: drop-shadow(0 0 6px var(--bcolor));
  }
  .b-title {
    flex: 1;
    min-width: 0;
  }
  .b-name {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    letter-spacing: 0.12em;
    color: var(--bcolor);
    text-shadow: 0 0 8px var(--bcolor);
  }
  .b-sub {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(255, 255, 255, 0.75);
    letter-spacing: 0.08em;
  }
  .oc {
    margin-left: 0.5rem;
    color: #ff3d77;
    text-shadow: 0 0 6px #ff3d77;
    animation: oc-blink 0.9s steps(2) infinite;
  }
  @keyframes oc-blink {
    50% {
      opacity: 0.45;
    }
  }
  .b-quit {
    flex: 0 0 auto;
    /* Full tap target: bailing out of a breach under pressure shouldn't
       need a precise stab at a 26px pill. */
    min-height: var(--tap);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0.45rem 0.75rem;
    background: rgba(255, 61, 119, 0.12);
    border: 1px solid rgba(255, 61, 119, 0.5);
    border-radius: var(--r-sm);
    color: #ff9db8;
    cursor: pointer;
    touch-action: manipulation;
    transition: background var(--transition-fast);
  }
  .b-quit:hover {
    background: rgba(255, 61, 119, 0.24);
  }
  @media (max-width: 380px) {
    .b-quit-label {
      display: none;
    }
  }

  /* While the rules are up the game stage is collapsed entirely. Left in the
     layout it forced the panel to the game's own 13:9 height, which is far
     shorter than a demo + caption + button — so the Start button fell off the
     bottom. Collapsed, the panel simply sizes to the card. The games stay
     mounted (they only start when `running` flips) so nothing re-initialises. */
  .stage-hidden {
    display: none;
  }

  /* ---- First-time rules card ---- */
  .b-rules {
    /* In flow, not absolute: the card decides the panel's height instead of
       being trapped inside it. */
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0.25rem 0.5rem;
  }
  .b-rules-card {
    width: 100%;
    max-width: 21rem;
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }

  /* Short viewports (landscape phones): demo beside the caption instead of
     above it, so the whole lesson — including the Start button — fits in
     ~360px of height without scrolling. */
  @media (max-height: 560px) {
    .b-rules-card {
      max-width: none;
      flex-direction: row;
      align-items: center;
      gap: 1.1rem;
      text-align: left;
    }
    .b-rules-card :global(.demo) {
      flex: 0 0 auto;
      width: 8.5rem;
    }
    .b-rules-copy {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.45rem;
    }
    .b-rules-go {
      width: 100%;
    }
  }
  .b-rules-title {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--fs-heading);
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--bcolor);
    text-shadow: 0 0 12px var(--bcolor);
  }
  .b-rules-goal {
    margin: 0;
    font-size: var(--fs-label);
    font-weight: 700;
    line-height: 1.45;
    color: var(--color-text-main);
  }
  .b-rules-warn {
    margin: 0.25rem 0 0;
    padding: 0.45rem 0.6rem;
    border-radius: var(--r-sm);
    background: rgba(255, 61, 119, 0.1);
    border: 1px solid rgba(255, 61, 119, 0.3);
    font-size: var(--fs-micro);
    line-height: 1.45;
    color: #ffb3c9;
  }
  .b-rules-go {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    margin-top: 0.4rem;
    width: 100%;
    min-height: var(--tap);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-md);
    background: var(--bcolor);
    color: #04060f;
    font-family: var(--font-heading);
    font-size: var(--fs-label);
    font-weight: 800;
    letter-spacing: 0.06em;
    transition:
      filter var(--transition-fast),
      transform var(--transition-fast);
  }
  .b-rules-go:hover {
    filter: brightness(1.08);
  }
  .b-rules-go:active {
    transform: scale(0.98);
  }
  .b-rules-foot {
    margin: 0;
    font-size: 0.5rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-faint);
  }

  .b-timer {
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .b-timer-fill {
    height: 100%;
    background: #ffb84d;
    box-shadow: 0 0 8px #ffb84d;
    transition: width 0.1s linear;
  }
  .b-timer-fill.hot {
    background: #ff3d3d;
    box-shadow: 0 0 10px #ff3d3d;
  }

  .b-shield {
    position: relative;
    height: 12px;
    border-radius: 4px;
    background: rgba(54, 230, 255, 0.1);
    overflow: hidden;
  }
  .b-shield-fill {
    height: 100%;
    background: #36e6ff;
    transition: width 0.2s linear;
  }
  .b-shield-label {
    position: absolute;
    inset: 0;
    font-family: var(--font-mono);
    font-size: 0.48rem;
    line-height: 12px;
    text-align: center;
    color: #04222c;
    font-weight: 700;
  }

  .b-stage {
    position: relative;
  }

  .b-splash {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-heading);
    font-size: 1.5rem;
    letter-spacing: 0.18em;
    color: var(--bcolor);
    text-shadow: 0 0 14px var(--bcolor);
    background: rgba(4, 8, 14, 0.55);
    border-radius: 8px;
  }
  .b-splash.win {
    color: #4dff88;
    text-shadow: 0 0 16px #4dff88;
  }
  .b-splash.fail {
    color: #ff3d3d;
    text-shadow: 0 0 16px #ff3d3d;
  }

  .b-flash {
    position: absolute;
    left: 50%;
    bottom: 6%;
    transform: translateX(-50%);
    z-index: 5;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    color: #ffd75e;
    text-shadow: 0 0 8px rgba(255, 215, 94, 0.8);
    background: rgba(4, 8, 14, 0.8);
    padding: 0.3rem 0.7rem;
    border-radius: 6px;
    white-space: nowrap;
  }

  .b-foot {
    font-family: var(--font-mono);
    /* Was 0.5rem (8px) — the only place the rules were ever stated, in type
       too small to read mid-breach. Still a reminder, now a legible one. */
    font-size: var(--fs-micro);
    letter-spacing: 0.08em;
    line-height: 1.4;
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
  }

  @media (prefers-reduced-motion: reduce) {
    .oc {
      animation: none;
    }
  }
</style>
