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
    win: () => void;
    flash: (msg: string) => void;
    penalty: (seconds: number) => void;
  }
  let { sec, overclock, mercy, running, decoys, win, flash, penalty }: Props = $props();

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
    <div class="ring" style={`background:${ringStyle};`}></div>
    <div class="ring-mask"></div>
    <div class="marker" style={`transform: rotate(${angle}deg);`}>
      <div class="marker-tip"></div>
    </div>
    <div class="hub">
      <div class="locks">
        {#each Array(totalLocks) as _, i (i)}
          <span class="lock" class:set={i < locksDone}>{i < locksDone ? '●' : '○'}</span>
        {/each}
      </div>
      <div class="hub-hint">TAP IN THE ARC</div>
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

  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    opacity: 0.9;
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
  }
  .lock.set {
    color: var(--bcolor);
    text-shadow: 0 0 8px var(--bcolor);
  }
  .hub-hint {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.5);
  }
</style>
