<script lang="ts">
  // CIRCUIT ROUTE — power rerouting: tap conduit tiles to rotate them and
  // bridge SRC (left edge) to SINK (right edge). Powered tiles glow live.
  // High security lets the ICE periodically scramble a powered node behind
  // you. Pure tap gameplay — born mobile.
  import { onMount } from 'svelte';

  interface Props {
    sec: number;
    overclock: boolean;
    mercy: boolean; // BYTE: absorb the first ICE scramble
    running: boolean;
    corrupt: boolean;
    /** First time playing this game — show live on-board guidance. */
    coach?: boolean;
    win: () => void;
    flash: (msg: string) => void;
  }
  let { sec, overclock, mercy, running, corrupt, coach = false, win, flash }: Props = $props();

  const W = 5 + (sec >= 2 ? 1 : 0);
  const H = 4 + (sec >= 3 ? 1 : 0);
  // Corruption undoes work the player already did, so it punishes the slow
  // solving that a bigger grid forces — the two escalations compounded, and
  // both switched on in the same security band. Corruption now waits for the
  // top band, and the overclock multiplier is gentler: at security 3 with
  // overclock the cadence goes 3.2s -> 4.4s, which is the difference between
  // re-routing faster than you can read the board and actually planning.
  const doCorrupt = corrupt || sec >= 3;
  const corruptEvery = (sec >= 3 ? 5.5 : 7.5) / (overclock ? 1.25 : 1);

  // Tile connections as [N, E, S, W]
  type Conn = [boolean, boolean, boolean, boolean];
  interface Tile {
    conn: Conn;
    powered: boolean;
    isPath: boolean;
  }

  const srcRow = Math.floor(Math.random() * H);
  const sinkRow = Math.floor(Math.random() * H);

  function rotCW(c: Conn): Conn {
    return [c[3], c[0], c[1], c[2]];
  }
  function rotN(c: Conn, n: number): Conn {
    let out = c;
    for (let i = 0; i < n; i++) out = rotCW(out);
    return out;
  }

  // --- BOARD GENERATION: carve a guaranteed solution path, fill the rest
  // with random junk, then scramble every tile's rotation.
  function buildBoard(): Tile[][] {
    const need: Conn[][] = Array.from({ length: H }, () =>
      Array.from({ length: W }, () => [false, false, false, false] as Conn),
    );

    // Random monotone-ish walk from (srcRow, 0) to (sinkRow, W-1): at each
    // column optionally wander vertically, then step east.
    let r = srcRow;
    need[r][0][3] = true; // enters from the west edge (the SRC)
    for (let c = 0; c < W; c++) {
      const targetR =
        c === W - 1
          ? sinkRow
          : Math.max(0, Math.min(H - 1, r + (Math.floor(Math.random() * 3) - 1)));
      while (r !== targetR) {
        const step = targetR > r ? 1 : -1;
        need[r][c][step > 0 ? 2 : 0] = true;
        r += step;
        need[r][c][step > 0 ? 0 : 2] = true;
      }
      if (c < W - 1) {
        need[r][c][1] = true;
        need[r][c + 1][3] = true;
      }
    }
    need[r][W - 1][1] = true; // exits east into the SINK

    const shapes: Conn[] = [
      [true, false, true, false], // straight
      [true, true, false, false], // corner
      [true, true, true, false], // tee
      [true, false, false, false], // stub
    ];

    return Array.from({ length: H }, (_, rr) =>
      Array.from({ length: W }, (_, cc) => {
        const isPath = need[rr][cc].some(Boolean);
        const base: Conn = isPath
          ? need[rr][cc]
          : rotN(shapes[Math.floor(Math.random() * shapes.length)], Math.floor(Math.random() * 4));
        return {
          conn: rotN(base, Math.floor(Math.random() * 4)),
          powered: false,
          isPath,
        };
      }),
    );
  }

  let board = $state(buildBoard());
  let solved = $state(false);
  let corruptFx = $state<{ r: number; c: number } | null>(null);
  let mercyLeft = mercy;
  let done = false;

  // Never start pre-solved: nudge the sink tile until the circuit is broken
  const ensureUnsolved = () => {
    for (let i = 0; i < 3 && computePowerInit(); i++) {
      board[sinkRow][W - 1].conn = rotCW(board[sinkRow][W - 1].conn);
    }
  };

  function computePower(): boolean {
    for (const row of board) for (const t of row) t.powered = false;
    // BFS from the src tile if it accepts power from the west edge
    if (!board[srcRow][0].conn[3]) return false;
    const q: [number, number][] = [[srcRow, 0]];
    board[srcRow][0].powered = true;
    const D = [
      [-1, 0],
      [0, 1],
      [1, 0],
      [0, -1],
    ];
    for (let i = 0; i < q.length; i++) {
      const [r, c] = q[i];
      for (let d = 0; d < 4; d++) {
        if (!board[r][c].conn[d]) continue;
        const nr = r + D[d][0];
        const nc = c + D[d][1];
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        const opposite = (d + 2) % 4;
        if (!board[nr][nc].conn[opposite] || board[nr][nc].powered) continue;
        board[nr][nc].powered = true;
        q.push([nr, nc]);
      }
    }
    return board[sinkRow][W - 1].powered && board[sinkRow][W - 1].conn[1];
  }
  const computePowerInit = computePower;
  ensureUnsolved();
  computePower();

  /* Coaching points at the live frontier: the first solution-path tile that
     isn't carrying power yet but touches a tile that is. That is always
     exactly where a rotation pays off, so the hint teaches the strategy
     ("extend the lit chain") rather than just naming a control.
     Recomputes whenever the board mutates, so it walks forward with you. */
  const hintTile = $derived.by(() => {
    if (!coach || solved) return null;
    // Nothing lit yet — the source tile itself needs turning to accept power.
    if (!board[srcRow][0].powered) return { r: srcRow, c: 0 };
    const D = [
      [-1, 0],
      [0, 1],
      [1, 0],
      [0, -1],
    ];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const t = board[r][c];
        if (t.powered || !t.isPath) continue;
        for (const [dr, dc] of D) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          if (board[nr][nc].powered) return { r, c };
        }
      }
    }
    return null;
  });

  function tapTile(r: number, c: number): void {
    if (!running || done) return;
    board[r][c].conn = rotCW(board[r][c].conn);
    if (computePower()) {
      solved = true;
      done = true;
      win();
    }
  }

  function iceScramble(): void {
    // Scramble a powered tile that isn't the src — undo the player's work
    const targets: [number, number][] = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (board[r][c].powered && !(r === srcRow && c === 0)) targets.push([r, c]);
      }
    }
    if (!targets.length) return;
    if (mercyLeft) {
      mercyLeft = false;
      flash('BYTE BUFFER — ICE BLOCKED');
      return;
    }
    const [r, c] = targets[Math.floor(Math.random() * targets.length)];
    board[r][c].conn = rotCW(board[r][c].conn);
    computePower();
    corruptFx = { r, c };
    setTimeout(() => (corruptFx = null), 600);
    flash('ICE SCRAMBLED A NODE');
  }

  onMount(() => {
    let last = performance.now();
    let clock = 0;
    let raf = requestAnimationFrame(function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!running || done || !doCorrupt) return;
      clock += dt;
      if (clock >= corruptEvery) {
        clock = 0;
        iceScramble();
      }
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="cr-wrap">
  <div
    class="cr-board"
    style={`grid-template-columns: var(--edge) repeat(${W}, var(--t)) var(--edge); grid-auto-rows: var(--t);`}
  >
    {#each board as row, r (r)}
      <div class="edge src" class:on={r === srcRow}>{r === srcRow ? '⚡' : ''}</div>
      {#each row as tile, c (c)}
        <button
          class="tile"
          class:powered={tile.powered}
          class:zapped={corruptFx?.r === r && corruptFx?.c === c}
          class:hint={hintTile?.r === r && hintTile?.c === c}
          onpointerdown={() => tapTile(r, c)}
        >
          {#if tile.conn[0]}<span class="arm n"></span>{/if}
          {#if tile.conn[1]}<span class="arm e"></span>{/if}
          {#if tile.conn[2]}<span class="arm s"></span>{/if}
          {#if tile.conn[3]}<span class="arm w"></span>{/if}
          <span class="node"></span>
          {#if hintTile?.r === r && hintTile?.c === c}
            <!-- Rotate glyph spins on the tile itself: the verb, shown -->
            <span class="hint-spin" aria-hidden="true">↻</span>
          {/if}
        </button>
      {/each}
      <div class="edge sink" class:on={r === sinkRow} class:lit={solved && r === sinkRow}>
        {r === sinkRow ? '◉' : ''}
      </div>
    {/each}
  </div>
</div>

<style>
  .cr-wrap {
    /* No forced aspect-ratio: the square tile grid drives its own size, so
       the board can't be crushed/overflowed by a wide 13:9 box on phones
       (that fight is what "butchered" the layout on mobile). */
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 12rem;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    padding: 0.5rem;
    overflow: hidden;
  }

  .cr-board {
    /* Fixed square tiles that always fit a phone width: W(<=6) tiles + 2
       edges + gaps stays well under a 320px viewport. Rows == columns via
       grid-auto-rows:var(--t) (set inline) so tiles are perfect squares. */
    --t: min(12vw, 2.9rem);
    --edge: 1rem;
    display: grid;
    gap: 3px;
    justify-content: center;
  }

  /* Source and sink are the two things the whole puzzle is *about*, and both
     were dim grey glyphs at the board's edge — easy to miss entirely on a
     first play. They now read as live terminals. */
  .edge {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.25);
  }
  .edge.on {
    color: #ffd75e;
    text-shadow: 0 0 10px rgba(255, 215, 94, 0.9);
    animation: port-throb 1.8s ease-in-out infinite;
  }
  @keyframes port-throb {
    50% {
      text-shadow: 0 0 18px rgba(255, 215, 94, 1);
    }
  }
  .edge.sink.on {
    color: rgba(255, 255, 255, 0.75);
    text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    animation: none;
  }
  .edge.sink.lit {
    color: #4dff88;
    text-shadow: 0 0 16px #4dff88;
    animation: port-throb 0.9s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .edge.on,
    .edge.sink.lit {
      animation: none;
    }
  }

  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(16, 26, 40, 0.85);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition:
      border-color 0.12s,
      box-shadow 0.12s;
    padding: 0;
  }
  .tile.powered {
    border-color: color-mix(in srgb, var(--bcolor) 65%, transparent);
    box-shadow: inset 0 0 10px color-mix(in srgb, var(--bcolor) 25%, transparent);
  }
  .tile.zapped {
    border-color: #ff3d3d;
    box-shadow: 0 0 14px rgba(255, 61, 61, 0.8);
  }

  /* ---- first-play coaching ---- */
  .tile.hint {
    border-color: #fff;
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.8),
      0 0 16px rgba(255, 255, 255, 0.5);
    animation: hint-breathe 1.05s ease-in-out infinite;
    z-index: 2;
  }
  @keyframes hint-breathe {
    50% {
      box-shadow:
        0 0 0 5px rgba(255, 255, 255, 0.25),
        0 0 24px rgba(255, 255, 255, 0.65);
    }
  }
  .hint-spin {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 1.15rem;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.9);
    pointer-events: none;
    animation: hint-turn 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
  }
  @keyframes hint-turn {
    0%,
    40% {
      transform: rotate(0deg);
    }
    70%,
    100% {
      transform: rotate(90deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile.hint,
    .hint-spin {
      animation: none;
    }
  }

  .arm {
    position: absolute;
    background: rgba(255, 255, 255, 0.28);
    border-radius: 2px;
  }
  .tile.powered .arm {
    background: var(--bcolor);
    box-shadow: 0 0 6px var(--bcolor);
  }
  .arm.n {
    left: calc(50% - 2px);
    top: 0;
    width: 4px;
    height: 50%;
  }
  .arm.s {
    left: calc(50% - 2px);
    bottom: 0;
    width: 4px;
    height: 50%;
  }
  .arm.e {
    top: calc(50% - 2px);
    right: 0;
    height: 4px;
    width: 50%;
  }
  .arm.w {
    top: calc(50% - 2px);
    left: 0;
    height: 4px;
    width: 50%;
  }
  .node {
    position: absolute;
    left: calc(50% - 4px);
    top: calc(50% - 4px);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
  }
  .tile.powered .node {
    background: var(--bcolor);
    box-shadow: 0 0 8px var(--bcolor);
  }
</style>
