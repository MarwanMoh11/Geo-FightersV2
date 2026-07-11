<script lang="ts">
  // --- BREACH OVERLAY: the GridRunner mini-game (Phase 1.96 JACK IN) ---
  // Pure DOM — the 3D world keeps simulating underneath while the player
  // pilots a packet through a procedurally braided circuit maze against a
  // timer, sequence-locked gates, BFS antivirus chasers, ordered switches
  // and fog, themed per building kind. Reports back via resolveBreach().
  // App.svelte mounts this only while uiState.breach is set, so the breach
  // config can be captured once at component init.
  import { onMount } from 'svelte';
  import { uiState } from '../core/UIState.svelte.ts';
  import { resolveBreach } from '../systems/BreachSystem';

  const breach = uiState.breach!;
  const kind = breach.kind;
  const sec = breach.security;
  const isCypher = uiState.selectedCharacter === 'cypher';
  const isByte = uiState.selectedCharacter === 'byte';

  const COLS = 13;
  const ROWS = 9;
  const DIRS4 = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  // --- DIFFICULTY MATRIX ---
  const BASE_TIME: Record<string, number> = {
    depot: 22,
    armory: 26,
    bank: 21,
    relay: 23,
    substation: 14,
    stashden: 24,
  };
  const timeLimit =
    (BASE_TIME[kind] ?? 22) *
    (sec === 0 ? 1.5 : sec === 2 ? 0.85 : sec === 3 ? 0.72 : 1) *
    (breach.overclock ? 0.65 : 1) *
    (isCypher ? 1.25 : 1); // CYPHER: born in the grid

  let chaserCount = kind === 'bank' && sec >= 1 ? 1 : 0;
  if (sec >= 3) chaserCount += 1;
  if (breach.overclock) chaserCount += 1;
  const gateCount = kind === 'armory' && sec >= 1 ? (sec >= 2 ? 2 : 1) : 0;
  const switchCount = kind === 'relay' && sec >= 1 ? 2 : 0;
  const fog = kind === 'stashden' && sec >= 1;
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
    // Braid: open a third of the removable walls — dead ends become loops,
    // which keeps chaser dodges possible and sprints satisfying
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

  // --- STATE ---
  const start = { r: 1, c: 1 };
  const exit = { r: ROWS - 2, c: COLS - 2 };
  const grid = generateMaze();

  let player = $state({ r: start.r, c: start.c });
  let timeLeft = $state(timeLimit);
  let phase = $state<'intro' | 'run' | 'done'>('intro');
  let resultText = $state('');
  let resultClass = $state('');
  let flashMsg = $state('');
  let byteFreeze = $state(isByte); // BYTE: first antivirus contact freezes it
  let switchesHit = $state(0);
  let activeGate = $state<number | null>(null);

  const ARROWS = ['↑', '↓', '←', '→'];
  function randomSeq(len: number): string[] {
    return Array.from({ length: len }, () => ARROWS[Math.floor(Math.random() * 4)]);
  }

  // Feature placement along the solution path (so gates/switches are mandatory)
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
    return p.reverse(); // start-adjacent → exit
  })();

  function pathCell(frac: number): [number, number] {
    const i = Math.max(0, Math.min(path.length - 2, Math.round(path.length * frac)));
    return path[i];
  }

  let gates = $state(
    Array.from({ length: gateCount }, (_, i) => {
      const [r, c] = pathCell(gateCount === 1 ? 0.55 : i === 0 ? 0.4 : 0.75);
      return { r, c, seq: randomSeq(4), progress: 0, open: false };
    }),
  );
  let switches = $state(
    Array.from({ length: switchCount }, (_, i) => {
      const [r, c] = pathCell(i === 0 ? 0.35 : 0.7);
      return { r, c, idx: i + 1, hit: false };
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

  const exitLocked = $derived(switchCount > 0 && switchesHit < switchCount);

  // --- HELPERS ---
  function gateAt(r: number, c: number) {
    return gates.find((g) => g.r === r && g.c === c);
  }
  function switchAt(r: number, c: number) {
    return switches.find((s) => s.r === r && s.c === c);
  }
  function visibleCell(r: number, c: number): boolean {
    if (!fog) return true;
    if (r === exit.r && c === exit.c) return true; // the way out always glows
    return Math.max(Math.abs(r - player.r), Math.abs(c - player.c)) <= 2;
  }
  function posStyle(r: number, c: number): string {
    return `left:${(c / COLS) * 100}%; top:${(r / ROWS) * 100}%; width:${100 / COLS}%; height:${100 / ROWS}%;`;
  }

  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function flash(msg: string): void {
    flashMsg = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashMsg = ''), 1400);
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

  function checkCollisions(): void {
    for (const ch of chasers) {
      if (ch.frozen > 0 || ch.r !== player.r || ch.c !== player.c) continue;
      if (byteFreeze) {
        byteFreeze = false;
        ch.frozen = 2.5;
        flash('BYTE PROTOCOL — ICE FROZEN');
        continue;
      }
      finish('fail');
      return;
    }
  }

  function tryMove(dr: number, dc: number): void {
    if (phase !== 'run' || activeGate !== null) return;
    const nr = player.r + dr;
    const nc = player.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === 1) return;
    const gi = gates.findIndex((g) => !g.open && g.r === nr && g.c === nc);
    if (gi !== -1) {
      activeGate = gi;
      gates[gi].progress = 0;
      return;
    }
    if (exitLocked && nr === exit.r && nc === exit.c) {
      flash('EXIT SEALED — HIT THE SWITCHES IN ORDER');
      return;
    }
    player = { r: nr, c: nc };
    const sw = switches.find((s) => !s.hit && s.r === nr && s.c === nc);
    if (sw) {
      if (sw.idx === switchesHit + 1) {
        sw.hit = true;
        switchesHit++;
        flash(switchesHit === switchCount ? 'EXIT UNSEALED' : `SWITCH ${sw.idx}/${switchCount}`);
      } else {
        flash(`WRONG ORDER — SWITCH ${switchesHit + 1} FIRST`);
      }
    }
    checkCollisions();
    if (phase === 'run' && player.r === exit.r && player.c === exit.c && !exitLocked) {
      finish('win');
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

  // --- INPUT ---
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
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish('abort');
      return;
    }
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

  // Swipe steering (repeats while dragging — hold a direction to run)
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
    const TH = 26;
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

  const HINTS: Record<string, string> = {
    depot: 'REACH THE EXIT NODE',
    armory: 'LOCKED GATES NEED THE ARROW SEQUENCE',
    bank: 'ANTIVIRUS HUNTS YOU — KEEP MOVING',
    relay: 'HIT SWITCH 1, THEN 2, THEN EXIT',
    substation: 'THE CLOCK IS THE ENEMY — SPRINT',
    stashden: 'DARK GRID — THE EXIT ALWAYS GLOWS',
  };

  onMount(() => {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    gridEl?.addEventListener('touchstart', onTouchStart, { passive: true });
    gridEl?.addEventListener('touchmove', onTouchMove, { passive: false });
    const introTimer = setTimeout(() => {
      if (phase === 'intro') phase = 'run';
    }, 900);

    let last = performance.now();
    let chaserClock = 0;
    let raf = requestAnimationFrame(function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (phase !== 'run') return;

      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        finish('fail');
        return;
      }

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
      clearTimeout(introTimer);
      clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      gridEl?.removeEventListener('touchstart', onTouchStart);
      gridEl?.removeEventListener('touchmove', onTouchMove);
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
          {#if sec === 0}
            SECURITY ZERO — TRAINING ICE
          {:else}
            SECURITY {'▮'.repeat(sec)}{'▯'.repeat(3 - sec)}
          {/if}
          {#if breach.overclock}<span class="oc">OVERCLOCK ×2</span>{/if}
        </div>
      </div>
      <button class="b-quit" onclick={() => finish('abort')}>EJECT ✕</button>
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

    <div class="b-grid" bind:this={gridEl} style={`grid-template-columns: repeat(${COLS}, 1fr);`}>
      {#each grid as row, r (r)}
        {#each row as cell, c (c)}
          <div
            class="cell"
            class:wall={cell === 1}
            class:exit={r === exit.r && c === exit.c}
            class:locked={r === exit.r && c === exit.c && exitLocked}
            class:fogged={!visibleCell(r, c)}
          >
            {#if gateAt(r, c) && !gateAt(r, c)!.open}<span class="gate">🔒</span>{/if}
            {#if switchAt(r, c)}
              <span class="sw" class:hit={switchAt(r, c)!.hit}>{switchAt(r, c)!.idx}</span>
            {/if}
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
              <button onclick={() => gateInput(a)}>{a}</button>
            {/each}
          </div>
          <button class="gp-back" onclick={() => (activeGate = null)}>STEP BACK</button>
        </div>
      {/if}

      {#if phase === 'intro'}
        <div class="b-splash">JACKING IN…</div>
      {:else if phase === 'done'}
        <div class="b-splash {resultClass}">{resultText}</div>
      {/if}
      {#if flashMsg}<div class="b-flash">{flashMsg}</div>{/if}
    </div>

    <footer class="b-foot">{HINTS[kind]} • WASD / ARROWS / SWIPE • ESC EJECTS</footer>
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
  }

  .breach-panel {
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
    font-family: var(--font-mono);
    font-size: 0.6rem;
    padding: 0.35rem 0.55rem;
    background: rgba(255, 61, 119, 0.12);
    border: 1px solid rgba(255, 61, 119, 0.5);
    border-radius: 6px;
    color: #ff9db8;
    cursor: pointer;
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

  .b-grid {
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
  .cell.exit.locked {
    background: rgba(255, 61, 61, 0.3);
    box-shadow: 0 0 8px rgba(255, 61, 61, 0.7);
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
  .sw {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 170, 0, 0.25);
    border: 1px solid #ffaa00;
    color: #ffd75e;
  }
  .sw.hit {
    background: rgba(77, 255, 136, 0.3);
    border-color: #4dff88;
    color: #4dff88;
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
    animation: oc-blink 0.8s steps(2) infinite;
  }
  .gp-pads {
    display: flex;
    gap: 0.45rem;
  }
  .gp-pads button {
    font-size: 1.15rem;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    cursor: pointer;
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
    .cell.exit,
    .oc,
    .gp-arrow.next {
      animation: none;
    }
  }
</style>
