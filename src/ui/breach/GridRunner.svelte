<script lang="ts">
  // GRID RUNNER — pilot a packet through a braided circuit maze: timer,
  // sequence-locked gates, BFS antivirus chasers, optional fog. Touch-first:
  // swipe to step, hold the on-screen D-pad to run; WASD/arrows on desktop.
  import { onMount } from 'svelte';

  interface Props {
    sec: number;
    overclock: boolean;
    mercy: boolean; // BYTE: first antivirus contact freezes it
    running: boolean;
    variant: 'chase' | 'fog';
    win: () => void;
    fail: () => void;
    flash: (msg: string) => void;
  }
  let { sec, overclock, mercy, running, variant, win, fail, flash }: Props = $props();

  const COLS = 13;
  const ROWS = 9;
  const DIRS4 = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  const fog = variant === 'fog';
  let chaserCount = variant === 'chase' ? 1 + (sec >= 2 ? 1 : 0) : sec >= 3 ? 1 : 0;
  if (overclock) chaserCount += 1;
  const gateCount = sec >= 1 ? (sec >= 2 ? 2 : 1) : 0;
  const chaserInterval = sec >= 2 ? 0.38 : 0.46;

  // --- MAZE (odd-grid recursive backtracker, braided so loops exist) ---
  function generateMaze(): number[][] {
    const g: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const stack: [number, number][] = [[1, 1]];
    g[1][1] = 0;
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const dirs = [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ].sort(() => Math.random() - 0.5);
      let carved = false;
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 1 || nr >= ROWS - 1 || nc < 1 || nc >= COLS - 1 || g[nr][nc] === 0) continue;
        g[r + dr / 2][c + dc / 2] = 0;
        g[nr][nc] = 0;
        stack.push([nr, nc]);
        carved = true;
        break;
      }
      if (!carved) stack.pop();
    }
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (g[r][c] !== 1 || Math.random() >= 0.35) continue;
        if ((g[r - 1][c] === 0 && g[r + 1][c] === 0) || (g[r][c - 1] === 0 && g[r][c + 1] === 0)) {
          g[r][c] = 0;
        }
      }
    }
    return g;
  }

  function bfs(g: number[][], sr: number, sc: number): number[][] {
    const dist: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    dist[sr][sc] = 0;
    const q: [number, number][] = [[sr, sc]];
    for (let i = 0; i < q.length; i++) {
      const [r, c] = q[i];
      for (const [dr, dc] of DIRS4) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (g[nr][nc] === 1 || dist[nr][nc] !== -1) continue;
        dist[nr][nc] = dist[r][c] + 1;
        q.push([nr, nc]);
      }
    }
    return dist;
  }

  const start = { r: 1, c: 1 };
  const exit = { r: ROWS - 2, c: COLS - 2 };
  const grid = generateMaze();
  const distFromStart = bfs(grid, start.r, start.c);

  const path: [number, number][] = (() => {
    const p: [number, number][] = [];
    let r = exit.r;
    let c = exit.c;
    while (!(r === start.r && c === start.c)) {
      p.push([r, c]);
      for (const [dr, dc] of DIRS4) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (distFromStart[nr][nc] === distFromStart[r][c] - 1) {
          r = nr;
          c = nc;
          break;
        }
      }
    }
    return p.reverse();
  })();

  function pathCell(frac: number): [number, number] {
    const i = Math.max(0, Math.min(path.length - 2, Math.round(path.length * frac)));
    return path[i];
  }

  const ARROWS = ['↑', '↓', '←', '→'];
  function randomSeq(len: number): string[] {
    return Array.from({ length: len }, () => ARROWS[Math.floor(Math.random() * 4)]);
  }

  let player = $state({ r: start.r, c: start.c });
  let byteFreeze = $state(mercy);
  let activeGate = $state<number | null>(null);
  let gates = $state(
    Array.from({ length: gateCount }, (_, i) => {
      const [r, c] = pathCell(gateCount === 1 ? 0.55 : i === 0 ? 0.4 : 0.75);
      return { r, c, seq: randomSeq(4), progress: 0, open: false };
    }),
  );
  let chasers = $state(
    (() => {
      const spots: { r: number; c: number; d: number }[] = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === 0 && distFromStart[r][c] >= 8 && !(r === exit.r && c === exit.c)) {
            spots.push({ r, c, d: distFromStart[r][c] });
          }
        }
      }
      spots.sort((a, b) => b.d - a.d);
      return Array.from({ length: chaserCount }, (_, i) => {
        const s = spots[Math.min(i * 2, spots.length - 1)] ?? { r: exit.r, c: exit.c };
        return { id: i, r: s.r, c: s.c, frozen: 0 };
      });
    })(),
  );

  function gateAt(r: number, c: number) {
    return gates.find((g) => g.r === r && g.c === c);
  }
  function visibleCell(r: number, c: number): boolean {
    if (!fog) return true;
    if (r === exit.r && c === exit.c) return true;
    return Math.max(Math.abs(r - player.r), Math.abs(c - player.c)) <= 2;
  }
  function posStyle(r: number, c: number): string {
    return `left:${(c / COLS) * 100}%; top:${(r / ROWS) * 100}%; width:${100 / COLS}%; height:${100 / ROWS}%;`;
  }

  let done = false;
  function checkCollisions(): void {
    for (const ch of chasers) {
      if (ch.frozen > 0 || ch.r !== player.r || ch.c !== player.c) continue;
      if (byteFreeze) {
        byteFreeze = false;
        ch.frozen = 2.5;
        flash('BYTE PROTOCOL — ICE FROZEN');
        continue;
      }
      done = true;
      fail();
      return;
    }
  }

  function tryMove(dr: number, dc: number): void {
    if (!running || done || activeGate !== null) return;
    const nr = player.r + dr;
    const nc = player.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === 1) return;
    const gi = gates.findIndex((g) => !g.open && g.r === nr && g.c === nc);
    if (gi !== -1) {
      activeGate = gi;
      gates[gi].progress = 0;
      return;
    }
    player = { r: nr, c: nc };
    checkCollisions();
    if (!done && player.r === exit.r && player.c === exit.c) {
      done = true;
      win();
    }
  }

  function gateInput(arrow: string): void {
    if (activeGate === null) return;
    const g = gates[activeGate];
    if (g.seq[g.progress] === arrow) {
      g.progress++;
      if (g.progress >= g.seq.length) {
        g.open = true;
        activeGate = null;
        flash('GATE BRIDGED');
      }
    } else {
      g.progress = 0;
    }
  }

  function stepChasers(): void {
    const dist = bfs(grid, player.r, player.c);
    for (const ch of chasers) {
      if (ch.frozen > 0) continue;
      let bestD = dist[ch.r][ch.c];
      const options: [number, number][] = [];
      for (const [dr, dc] of DIRS4) {
        const nr = ch.r + dr;
        const nc = ch.c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === 1) continue;
        const d = dist[nr][nc];
        if (d === -1) continue;
        if (d < bestD) {
          bestD = d;
          options.length = 0;
          options.push([nr, nc]);
        } else if (d === bestD && options.length) {
          options.push([nr, nc]);
        }
      }
      if (options.length) {
        const [nr, nc] = options[Math.floor(Math.random() * options.length)];
        ch.r = nr;
        ch.c = nc;
      }
    }
    checkCollisions();
  }

  // --- INPUT: keyboard ---
  const keysDown = new Set<string>();
  let moveCooldown = 0;
  const MOVE_INTERVAL = 0.13;

  function dirFromKey(code: string): [number, number, string] | null {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        return [-1, 0, '↑'];
      case 'ArrowDown':
      case 'KeyS':
        return [1, 0, '↓'];
      case 'ArrowLeft':
      case 'KeyA':
        return [0, -1, '←'];
      case 'ArrowRight':
      case 'KeyD':
        return [0, 1, '→'];
    }
    return null;
  }

  function onKeyDown(e: KeyboardEvent): void {
    const d = dirFromKey(e.code);
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    if (activeGate !== null) {
      if (!e.repeat) gateInput(d[2]);
      return;
    }
    keysDown.add(e.code);
    if (!e.repeat) {
      tryMove(d[0], d[1]);
      moveCooldown = MOVE_INTERVAL;
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    keysDown.delete(e.code);
  }

  // --- INPUT: swipe on the maze ---
  let gridEl: HTMLDivElement;
  let touchX = 0;
  let touchY = 0;
  function onTouchStart(e: TouchEvent): void {
    const t = e.touches[0];
    touchX = t.clientX;
    touchY = t.clientY;
  }
  function onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    const TH = 24;
    if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
    touchX = t.clientX;
    touchY = t.clientY;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (activeGate !== null) gateInput(dx > 0 ? '→' : '←');
      else tryMove(0, Math.sign(dx));
    } else {
      if (activeGate !== null) gateInput(dy > 0 ? '↓' : '↑');
      else tryMove(Math.sign(dy), 0);
    }
  }

  // --- INPUT: hold-to-run D-pad (touch devices) ---
  const isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  let padRepeat: ReturnType<typeof setInterval> | null = null;

  function padPress(dr: number, dc: number, arrow: string): void {
    if (activeGate !== null) {
      gateInput(arrow);
      return;
    }
    tryMove(dr, dc);
    if (padRepeat) clearInterval(padRepeat);
    padRepeat = setInterval(() => {
      if (activeGate !== null) return;
      tryMove(dr, dc);
    }, 160);
  }
  function padRelease(): void {
    if (padRepeat) {
      clearInterval(padRepeat);
      padRepeat = null;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    gridEl?.addEventListener('touchstart', onTouchStart, { passive: true });
    gridEl?.addEventListener('touchmove', onTouchMove, { passive: false });

    let last = performance.now();
    let chaserClock = 0;
    let raf = requestAnimationFrame(function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!running || done) return;

      moveCooldown -= dt;
      if (moveCooldown <= 0 && activeGate === null && keysDown.size) {
        const codes = [...keysDown];
        const d = dirFromKey(codes[codes.length - 1]);
        if (d) {
          tryMove(d[0], d[1]);
          moveCooldown = MOVE_INTERVAL;
        }
      }

      for (const ch of chasers) if (ch.frozen > 0) ch.frozen -= dt;
      chaserClock += dt;
      if (chaserClock >= chaserInterval && chasers.length) {
        chaserClock = 0;
        stepChasers();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      padRelease();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      gridEl?.removeEventListener('touchstart', onTouchStart);
      gridEl?.removeEventListener('touchmove', onTouchMove);
    };
  });
</script>

<div class="gr-wrap">
  <div class="gr-grid" bind:this={gridEl} style={`grid-template-columns: repeat(${COLS}, 1fr);`}>
    {#each grid as row, r (r)}
      {#each row as cell, c (c)}
        <div
          class="cell"
          class:wall={cell === 1}
          class:exit={r === exit.r && c === exit.c}
          class:fogged={!visibleCell(r, c)}
        >
          {#if gateAt(r, c) && !gateAt(r, c)!.open}<span class="gate">🔒</span>{/if}
        </div>
      {/each}
    {/each}
    <div class="packet" style={posStyle(player.r, player.c)}></div>
    {#each chasers as ch (ch.id)}
      <div class="chaser" class:frozen={ch.frozen > 0} style={posStyle(ch.r, ch.c)}></div>
    {/each}

    {#if activeGate !== null}
      <div class="gate-panel">
        <div class="gp-title">FIREWALL GATE — ENTER SEQUENCE</div>
        <div class="gp-seq">
          {#each gates[activeGate].seq as a, i (i)}
            <span
              class="gp-arrow"
              class:done={i < gates[activeGate].progress}
              class:next={i === gates[activeGate].progress}>{a}</span
            >
          {/each}
        </div>
        <div class="gp-pads">
          {#each ARROWS as a (a)}
            <button onpointerdown={() => gateInput(a)}>{a}</button>
          {/each}
        </div>
        <button class="gp-back" onpointerdown={() => (activeGate = null)}>STEP BACK</button>
      </div>
    {/if}
  </div>

  {#if isTouch}
    <div class="dpad">
      <button
        class="dp up"
        onpointerdown={() => padPress(-1, 0, '↑')}
        onpointerup={padRelease}
        onpointercancel={padRelease}
        onpointerleave={padRelease}>▲</button
      >
      <button
        class="dp left"
        onpointerdown={() => padPress(0, -1, '←')}
        onpointerup={padRelease}
        onpointercancel={padRelease}
        onpointerleave={padRelease}>◀</button
      >
      <button
        class="dp right"
        onpointerdown={() => padPress(0, 1, '→')}
        onpointerup={padRelease}
        onpointercancel={padRelease}
        onpointerleave={padRelease}>▶</button
      >
      <button
        class="dp down"
        onpointerdown={() => padPress(1, 0, '↓')}
        onpointerup={padRelease}
        onpointercancel={padRelease}
        onpointerleave={padRelease}>▼</button
      >
    </div>
  {/if}
</div>

<style>
  .gr-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .gr-grid {
    position: relative;
    display: grid;
    gap: 2px;
    aspect-ratio: 13 / 9;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    padding: 3px;
    touch-action: none;
  }
  .cell {
    position: relative;
    border-radius: 2px;
    background: rgba(28, 44, 66, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
  }
  .cell.wall {
    background: color-mix(in srgb, var(--bcolor) 16%, rgba(10, 16, 26, 0.95));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bcolor) 25%, transparent);
  }
  .cell.exit {
    background: rgba(77, 255, 136, 0.35);
    box-shadow: 0 0 10px rgba(77, 255, 136, 0.8);
    animation: exit-pulse 1.2s ease-in-out infinite;
  }
  @keyframes exit-pulse {
    50% {
      box-shadow: 0 0 16px rgba(77, 255, 136, 1);
    }
  }
  .cell.fogged {
    opacity: 0.07;
  }
  .gate {
    font-size: 0.8rem;
    filter: drop-shadow(0 0 4px #ffaa00);
  }

  .packet {
    position: absolute;
    border-radius: 3px;
    background: var(--bcolor);
    box-shadow: 0 0 12px var(--bcolor);
    transform: scale(0.62);
    transition:
      left 0.09s linear,
      top 0.09s linear;
    z-index: 2;
  }
  .chaser {
    position: absolute;
    background: #ff3d3d;
    box-shadow: 0 0 12px #ff3d3d;
    transform: scale(0.55) rotate(45deg);
    border-radius: 2px;
    transition:
      left 0.2s linear,
      top 0.2s linear;
    z-index: 2;
  }
  .chaser.frozen {
    background: #7ad7ff;
    box-shadow: 0 0 12px #7ad7ff;
    opacity: 0.7;
  }

  .gate-panel {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    background: rgba(4, 8, 14, 0.88);
    border-radius: 8px;
  }
  .gp-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    color: #ffaa00;
  }
  .gp-seq {
    display: flex;
    gap: 0.5rem;
  }
  .gp-arrow {
    font-size: 1.4rem;
    width: 2.2rem;
    height: 2.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 170, 0, 0.5);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.55);
  }
  .gp-arrow.done {
    color: #4dff88;
    border-color: #4dff88;
    background: rgba(77, 255, 136, 0.12);
  }
  .gp-arrow.next {
    color: #ffd75e;
    border-color: #ffd75e;
    animation: blink 0.8s steps(2) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.45;
    }
  }
  .gp-pads {
    display: flex;
    gap: 0.45rem;
  }
  .gp-pads button {
    font-size: 1.15rem;
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    cursor: pointer;
    touch-action: manipulation;
  }
  .gp-back {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    padding: 0.3rem 0.6rem;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    touch-action: manipulation;
  }

  /* Hold-to-run D-pad (touch only) */
  .dpad {
    display: grid;
    grid-template-areas: '. up .' 'left . right' '. down .';
    gap: 0.3rem;
    justify-content: center;
  }
  .dp {
    width: 3.1rem;
    height: 2.5rem;
    font-size: 1rem;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--bcolor) 55%, transparent);
    background: color-mix(in srgb, var(--bcolor) 14%, rgba(8, 14, 22, 0.9));
    color: #fff;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .dp:active {
    background: color-mix(in srgb, var(--bcolor) 34%, rgba(8, 14, 22, 0.9));
  }
  .dp.up {
    grid-area: up;
  }
  .dp.down {
    grid-area: down;
  }
  .dp.left {
    grid-area: left;
  }
  .dp.right {
    grid-area: right;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell.exit,
    .gp-arrow.next {
      animation: none;
    }
  }
</style>
