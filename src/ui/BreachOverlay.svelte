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
  import { uiState } from '../core/UIState.svelte.ts';
  import { resolveBreach } from '../systems/BreachSystem';
  import GridRunner from './breach/GridRunner.svelte';
  import CrackTimer from './breach/CrackTimer.svelte';
  import CodeCascade from './breach/CodeCascade.svelte';
  import CircuitRoute from './breach/CircuitRoute.svelte';

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
  let phase = $state<'intro' | 'run' | 'done'>('intro');
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

  onMount(() => {
    window.addEventListener('keydown', onKeyDown, true);
    const introTimer = setTimeout(() => {
      if (phase === 'intro') phase = 'run';
    }, 900);

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
      clearTimeout(introTimer);
      clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  });
</script>

<div class="breach-backdrop">
  <div class="breach-panel" style={`--bcolor:${breach.color};`}>
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
      <button class="b-quit" onpointerdown={() => finish('abort')}>EJECT ✕</button>
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

    <div class="b-stage">
      {#if plan.game === 'runner'}
        <GridRunner
          {sec}
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

    <footer class="b-foot">{GAME_HINTS[plan.game]} • ESC EJECTS</footer>
  </div>
</div>

<style>
  .breach-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(3, 7, 13, 0.82);
    backdrop-filter: blur(2px);
    touch-action: none;
  }

  .breach-panel {
    width: min(94vw, 580px);
    max-height: 96dvh;
    overflow-y: auto;
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
    font-family: var(--font-mono);
    font-size: 0.62rem;
    padding: 0.45rem 0.65rem;
    background: rgba(255, 61, 119, 0.12);
    border: 1px solid rgba(255, 61, 119, 0.5);
    border-radius: 6px;
    color: #ff9db8;
    cursor: pointer;
    touch-action: manipulation;
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
    font-size: 0.5rem;
    letter-spacing: 0.08em;
    text-align: center;
    color: rgba(255, 255, 255, 0.45);
  }

  @media (prefers-reduced-motion: reduce) {
    .oc {
      animation: none;
    }
  }
</style>
