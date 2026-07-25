<script lang="ts">
  // CRACK TIMER — safecracker's dial: a marker sweeps the ring; tap (or
  // SPACE) inside the glowing arc to set each lock. Arcs shrink, speed
  // climbs, direction flips per lock; high security adds a red DECOY arc
  // that costs you time if you bite. Tap-native by design.
  import { onMount } from 'svelte';

  interface Props {
    sec: number;
    overclock: boolean;
    mercy: boolean; // BYTE: absorb one miss
    running: boolean;
    decoys: boolean;
    /** First time playing this game — show live on-board guidance. */
    coach?: boolean;
    win: () => void;
    flash: (msg: string) => void;
    penalty: (seconds: number) => void;
  }
  let {
    sec,
    overclock,
    mercy,
    running,
    decoys,
    coach = false,
    win,
    flash,
    penalty,
  }: Props = $props();

  const totalLocks = Math.min(6, 2 + sec + (overclock ? 1 : 0));
  const useDecoys = decoys || sec >= 2;

  let locksDone = $state(0);
  let angle = $state(0);
  let dir = 1;
  let target = $state({ start: 0, size: 0 });
  let decoy = $state<{ start: number; size: number } | null>(null);
  let mercyLeft = mercy;
  let hitFlash = $state<'' | 'good' | 'bad'>('');
  let done = false;

  function speedFor(lock: number): number {
    return 150 + sec * 35 + lock * 14;
  }
  function arcFor(lock: number): number {
    return Math.max(14, 46 - sec * 6 - lock * 3);
  }

  function rollArcs(): void {
    const size = arcFor(locksDone);
    const start = 20 + Math.random() * 320;
    target = { start, size };
    if (useDecoys) {
      // Decoy sits a half-turn-ish away from the real arc
      const dStart = (start + 120 + Math.random() * 120) % 360;
      decoy = { start: dStart, size: size + 6 };
    } else {
      decoy = null;
    }
  }
  rollArcs();

  function inArc(a: number, arc: { start: number; size: number }): boolean {
    const rel = (((a - arc.start) % 360) + 360) % 360;
    return rel <= arc.size;
  }

  function tap(): void {
    if (!running || done) return;
    if (inArc(angle, target)) {
      locksDone++;
      hitFlash = 'good';
      setTimeout(() => (hitFlash = ''), 220);
      if (locksDone >= totalLocks) {
        done = true;
        win();
        return;
      }
      flash(`LOCK ${locksDone}/${totalLocks} SET`);
      dir = -dir;
      rollArcs();
    } else if (decoy && inArc(angle, decoy)) {
      hitFlash = 'bad';
      setTimeout(() => (hitFlash = ''), 220);
      if (mercyLeft) {
        mercyLeft = false;
        flash('BYTE BUFFER — DECOY ABSORBED');
        return;
      }
      penalty(2.5);
      flash('DECOY ARC — TRACE SPIKE');
    } else {
      hitFlash = 'bad';
      setTimeout(() => (hitFlash = ''), 220);
      if (mercyLeft) {
        mercyLeft = false;
        flash('BYTE BUFFER — MISS ABSORBED');
        return;
      }
      penalty(1.5);
      rollArcs();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) tap();
    }
  }

  // Conic-gradient stops must be ascending and can't wrap 360 — arcs are
  // split at the seam and sorted before the gradient string is built.
  const ringStyle = $derived.by(() => {
    const segs: { a: number; b: number; color: string }[] = [];
    const add = (start: number, size: number, color: string) => {
      const s = ((start % 360) + 360) % 360;
      const e = s + size;
      if (e <= 360) segs.push({ a: s, b: e, color });
      else {
        segs.push({ a: s, b: 360, color });
        segs.push({ a: 0, b: e - 360, color });
      }
    };
    add(target.start, target.size, 'var(--bcolor)');
    if (decoy) add(decoy.start, decoy.size, '#ff3d3d');
    segs.sort((x, y) => x.a - y.a);

    let css = 'conic-gradient(from 0deg';
    let cur = 0;
    for (const seg of segs) {
      css += `, transparent ${cur}deg ${seg.a}deg, ${seg.color} ${seg.a}deg ${seg.b}deg`;
      cur = seg.b;
    }
    return css + `, transparent ${cur}deg 360deg)`;
  });

  /* Live coaching for the first lock only: the arc is marked with a ghost
     finger so you know WHERE, and a TAP NOW cue fires the instant the needle
     is actually inside it so you learn WHEN. Both vanish once the first pin
     sets — by then the mechanic has been felt, not read. */
  const coaching = $derived(coach && locksDone === 0 && running);
  const arcMid = $derived(target.start + target.size / 2);
  const inTarget = $derived(inArc(angle, target));

  onMount(() => {
    window.addEventListener('keydown', onKey, true);
    let last = performance.now();
    let raf = requestAnimationFrame(function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!running || done) return;
      angle = (((angle + dir * speedFor(locksDone) * dt) % 360) + 360) % 360;
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
    };
  });
</script>

<!-- A real <button> is the tap surface: mobile Safari reliably fires
     pointer/touch events on buttons but is flaky on plain divs — that was
     why "tapping doesn't work" here while the button-based games did. -->
<button class="ct-wrap" type="button" onpointerdown={tap}>
  <div class="dial" class:good={hitFlash === 'good'} class:bad={hitFlash === 'bad'}>
    <!-- Track sits under the arc gradient. Without it the dial was invisible
         except for the lit arc, so there was no read on how far the needle
         still had to travel — the whole tension of the mechanic. -->
    <div class="track"></div>
    <div class="ring" style={`background:${ringStyle};`}></div>
    <div class="ring-mask"></div>
    <div class="marker" style={`transform: rotate(${angle}deg);`}>
      <div class="marker-tip"></div>
    </div>

    {#if coaching}
      <!-- Ghost finger parked on the arc: the target, in the same visual
           language the demo just used. -->
      <div class="coach-hand" style={`transform: rotate(${arcMid}deg);`}>
        <span class="hand-dot"></span>
      </div>
    {/if}

    <div class="hub">
      <div class="locks">
        {#each Array(totalLocks) as _, i (i)}
          <span class="lock" class:set={i < locksDone}>{i < locksDone ? '●' : '○'}</span>
        {/each}
      </div>
      {#if coaching}
        <div class="hub-cue" class:now={inTarget}>{inTarget ? 'TAP NOW' : 'WAIT…'}</div>
      {:else}
        <div class="hub-hint">TAP IN THE ARC</div>
      {/if}
    </div>
  </div>
</button>

<style>
  .ct-wrap {
    /* reset button chrome — this is a full-area tap surface */
    appearance: none;
    border: none;
    font: inherit;
    color: inherit;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 13 / 9;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    touch-action: manipulation;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .dial {
    /* Height-driven so it never overflows the 13:9 tap surface on phones
       (height is the tighter dimension); capped so it isn't huge on desktop. */
    position: relative;
    height: 86%;
    aspect-ratio: 1;
    max-width: 92%;
    border-radius: 50%;
    transition: filter 0.15s;
  }
  .dial.good {
    filter: drop-shadow(0 0 18px #4dff88);
  }
  .dial.bad {
    filter: drop-shadow(0 0 18px #ff3d3d);
  }

  .track {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.09);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
  }

  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    opacity: 0.95;
  }
  /* Punch the ring into an annulus */
  .ring-mask {
    position: absolute;
    inset: 14%;
    border-radius: 50%;
    background: rgba(6, 12, 20, 0.97);
    box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.8);
  }

  .marker {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
  .marker-tip {
    position: absolute;
    /* conic-gradient 0deg points up; place the needle on the same origin */
    left: calc(50% - 2px);
    top: -2%;
    width: 4px;
    height: 20%;
    border-radius: 3px;
    background: #fff;
    box-shadow: 0 0 10px #fff;
  }

  .hub {
    position: absolute;
    inset: 20%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    pointer-events: none;
  }
  .locks {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem;
  }
  .lock {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.35);
    transition:
      color 0.2s,
      transform 0.2s;
  }
  .lock.set {
    color: var(--bcolor);
    text-shadow: 0 0 10px var(--bcolor);
    transform: scale(1.15);
  }
  .hub-hint {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.5);
  }

  /* ---- first-lock coaching ---- */
  .coach-hand {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
  }
  /* Sits on the ring itself at the arc's midpoint, so "where" needs no words */
  .hand-dot {
    position: absolute;
    left: calc(50% - 11px);
    top: 1%;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 34% 30%,
      rgba(255, 255, 255, 0.95),
      rgba(255, 255, 255, 0.35)
    );
    border: 1.5px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
    animation: hand-bob 1.1s ease-in-out infinite;
  }
  @keyframes hand-bob {
    50% {
      transform: scale(0.82);
      opacity: 0.75;
    }
  }

  .hub-cue {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    padding: 0.15rem 0.5rem;
    border-radius: var(--r-pill);
    color: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition:
      color 0.08s,
      background 0.08s,
      border-color 0.08s;
  }
  /* The moment the needle is genuinely inside the arc — this is the whole
     lesson, delivered as a state change rather than a sentence. */
  .hub-cue.now {
    color: #04060f;
    background: #4dff88;
    border-color: #4dff88;
    box-shadow: 0 0 16px rgba(77, 255, 136, 0.9);
    animation: cue-punch 0.5s ease-in-out infinite;
  }
  @keyframes cue-punch {
    50% {
      transform: scale(1.09);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-dot,
    .hub-cue.now {
      animation: none;
    }
  }
</style>
