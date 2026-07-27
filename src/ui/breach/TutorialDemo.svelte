<script lang="ts">
  /**
   * Animated mini-demos for the breach games — "show, don't tell".
   *
   * A paragraph describing a safecracking dial teaches nothing; watching a
   * needle sweep into an arc and a finger tap it teaches it in one loop.
   * Each demo is a self-playing miniature of the real mechanic, driven
   * entirely by CSS keyframes on transform/opacity (no JS timers, no layout
   * thrash) so it costs nothing while a run is paused behind it.
   *
   * Every demo shares the same vocabulary: a translucent ghost finger marks
   * where to touch, a ripple confirms the tap landed, and green means the
   * game accepted it.
   */
  interface Props {
    /** `move` is the core control demo; the rest are the four breach games. */
    game: 'runner' | 'crack' | 'cascade' | 'route' | 'move';
  }
  let { game }: Props = $props();
</script>

<div class="demo" data-game={game} aria-hidden="true">
  {#if game === 'move'}
    <!-- Drag anywhere: the stick spawns under the finger and the ship trails it. -->
    <div class="stage move">
      <span class="stick-ring"></span>
      <span class="stick-knob"></span>
      <span class="finger move-finger"></span>
      <span class="ship-dot"></span>
      <span class="cue move-cue">DRAG</span>
    </div>
  {:else if game === 'crack'}
    <!-- Needle sweeps the dial; the finger taps as it crosses the lit arc. -->
    <div class="stage crack">
      <svg viewBox="0 0 120 120">
        <circle class="track" cx="60" cy="60" r="42" />
        <!-- Target arc sits at the top, spanning roughly ±20° -->
        <path class="arc" d="M 45.6 20.1 A 42 42 0 0 1 74.4 20.1" />
        <g class="needle">
          <line x1="60" y1="60" x2="60" y2="21" />
          <circle class="hub" cx="60" cy="60" r="5" />
        </g>
      </svg>
      <span class="ripple crack-ripple"></span>
      <span class="finger crack-finger"></span>
      <span class="cue crack-cue">TAP</span>
    </div>
  {:else if game === 'cascade'}
    <!-- Three glyphs light in order, then the finger repeats them. -->
    <div class="stage cascade">
      <div class="pads">
        <span class="pad p0">◆</span>
        <span class="pad">▲</span>
        <span class="pad p1">●</span>
        <span class="pad">★</span>
        <span class="pad p2">✚</span>
        <span class="pad">☰</span>
      </div>
      <span class="finger cascade-finger"></span>
      <span class="cue cascade-watch">WATCH</span>
      <span class="cue cascade-repeat">REPEAT</span>
    </div>
  {:else if game === 'route'}
    <!-- One misaligned conduit blocks the circuit; a tap rotates it and
         power reaches the sink. -->
    <div class="stage route">
      <div class="rail">
        <span class="port src">⚡</span>
        <span class="conduit lit"><i class="arm h"></i></span>
        <span class="conduit turn"><i class="arm h"></i></span>
        <span class="conduit last"><i class="arm h"></i></span>
        <span class="port sink">◉</span>
      </div>
      <span class="ripple route-ripple"></span>
      <span class="finger route-finger"></span>
      <span class="cue route-cue">ROTATE</span>
    </div>
  {:else}
    <!-- Packet swipes through the maze to the exit while a chaser closes. -->
    <div class="stage runner">
      <div class="maze">
        {#each Array(24) as _, i (i)}
          <span class="cell" class:wall={[1, 5, 9, 13, 14, 18].includes(i)}></span>
        {/each}
        <span class="goal"></span>
        <span class="packet"></span>
        <span class="chaser"></span>
      </div>
      <span class="swipe"></span>
      <span class="cue runner-cue">SWIPE</span>
    </div>
  {/if}
</div>

<style>
  .demo {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stage {
    position: relative;
    width: 100%;
    /* Compact on purpose: the demo shares a phone-height panel with a title,
       a goal line, a warning and a button. Any larger and the card starts
       scrolling, which is exactly what makes a tutorial feel like homework. */
    max-width: 9.5rem;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ---------- shared vocabulary ---------- */

  /* Ghost finger: a soft translucent disc, the universal "touch here" mark */
  .finger {
    position: absolute;
    width: 26px;
    height: 26px;
    margin: -13px 0 0 -13px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 34% 30%,
      rgba(255, 255, 255, 0.95),
      rgba(255, 255, 255, 0.4)
    );
    border: 1.5px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
    opacity: 0;
    pointer-events: none;
  }

  .ripple {
    position: absolute;
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    border-radius: 50%;
    border: 2px solid #fff;
    opacity: 0;
    pointer-events: none;
  }

  .cue {
    position: absolute;
    padding: 0.14rem 0.45rem;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.92);
    color: #04060f;
    font-family: var(--font-mono);
    font-size: 0.5rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    opacity: 0;
    pointer-events: none;
    white-space: nowrap;
  }

  /* ============ MOVE (core control) ============ */
  .stick-ring {
    position: absolute;
    left: 26%;
    top: 56%;
    width: 46%;
    aspect-ratio: 1;
    margin: -23% 0 0 -23%;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.04);
    animation: stick-fade 3.2s ease-in-out infinite;
  }
  @keyframes stick-fade {
    0%,
    8% {
      opacity: 0;
    }
    16%,
    84% {
      opacity: 1;
    }
    94%,
    100% {
      opacity: 0;
    }
  }
  .stick-knob {
    position: absolute;
    left: 26%;
    top: 56%;
    width: 20%;
    aspect-ratio: 1;
    margin: -10% 0 0 -10%;
    border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, #8df6ff, var(--color-primary) 62%, #12a7bd);
    box-shadow: 0 0 14px rgba(54, 230, 255, 0.85);
    animation: stick-drag 3.2s ease-in-out infinite;
  }
  /* The finger and the knob share one path — that IS the mechanic. They must
     therefore share one keyframe set AND one size basis: the knob translates
     in percentages of its own box, so a px-based finger silently drifts off
     the stick as the demo scales. */
  .move-finger {
    left: 26%;
    top: 56%;
    width: 20%;
    height: auto;
    aspect-ratio: 1;
    margin: -10% 0 0 -10%;
    animation: stick-drag 3.2s ease-in-out infinite;
  }
  @keyframes stick-drag {
    0%,
    12% {
      opacity: 0;
      transform: translate(0, 0);
    }
    18% {
      opacity: 1;
      transform: translate(0, 0);
    }
    46% {
      opacity: 1;
      transform: translate(52%, -46%);
    }
    72% {
      opacity: 1;
      transform: translate(78%, 22%);
    }
    88% {
      opacity: 1;
      transform: translate(78%, 22%);
    }
    96%,
    100% {
      opacity: 0;
      transform: translate(78%, 22%);
    }
  }

  /* Ship trails the stick with a lag, the way the real fighter does */
  .ship-dot {
    position: absolute;
    left: 62%;
    top: 24%;
    width: 15%;
    aspect-ratio: 1;
    margin: -7.5% 0 0 -7.5%;
    background: var(--color-text-main);
    box-shadow: 0 0 10px rgba(234, 242, 255, 0.7);
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    animation: ship-follow 3.2s ease-in-out infinite;
  }
  @keyframes ship-follow {
    0%,
    22% {
      transform: translate(0, 0);
    }
    54% {
      transform: translate(26%, -34%);
    }
    80%,
    100% {
      transform: translate(44%, 16%);
    }
  }
  .move-cue {
    top: 6%;
    left: 22%;
    animation: cue-blink 3.2s ease-in-out infinite;
  }

  /* ============ CRACK TIMER ============ */
  .crack svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 7;
  }
  .arc {
    fill: none;
    stroke: var(--bcolor, var(--color-primary));
    stroke-width: 7;
    stroke-linecap: round;
    filter: drop-shadow(0 0 5px var(--bcolor, var(--color-primary)));
    animation: arc-cycle 3s ease-in-out infinite;
  }
  @keyframes arc-cycle {
    0%,
    44% {
      stroke: var(--bcolor, var(--color-primary));
    }
    52%,
    72% {
      stroke: #4dff88;
      stroke-width: 9;
    }
    80%,
    100% {
      stroke: var(--bcolor, var(--color-primary));
    }
  }
  .needle {
    transform-origin: 60px 60px;
    animation: needle-sweep 3s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }
  .needle line {
    stroke: #fff;
    stroke-width: 3.5;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px #fff);
  }
  .hub {
    fill: #fff;
  }
  @keyframes needle-sweep {
    0% {
      transform: rotate(-135deg);
    }
    48% {
      transform: rotate(0deg);
    }
    62% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(135deg);
    }
  }
  .crack-finger {
    top: 18%;
    left: 50%;
    animation: crack-finger 3s ease-in-out infinite;
  }
  @keyframes crack-finger {
    0%,
    32% {
      opacity: 0;
      transform: translateY(16px) scale(1.25);
    }
    44% {
      opacity: 0.95;
      transform: translateY(0) scale(1);
    }
    56% {
      opacity: 0.95;
      transform: translateY(0) scale(0.82);
    }
    70%,
    100% {
      opacity: 0;
      transform: translateY(0) scale(1);
    }
  }
  .crack-ripple {
    top: 18%;
    left: 50%;
    animation: ripple-pop 3s ease-out infinite;
  }
  @keyframes ripple-pop {
    0%,
    48% {
      opacity: 0;
      transform: scale(0.4);
    }
    56% {
      opacity: 0.9;
      transform: scale(1);
    }
    72%,
    100% {
      opacity: 0;
      transform: scale(1.9);
    }
  }
  .crack-cue {
    top: 4%;
    left: 50%;
    transform: translateX(-50%);
    animation: cue-blink 3s ease-in-out infinite;
  }
  @keyframes cue-blink {
    0%,
    30% {
      opacity: 0;
    }
    40%,
    62% {
      opacity: 1;
    }
    74%,
    100% {
      opacity: 0;
    }
  }

  /* ============ CODE CASCADE ============ */
  .cascade {
    flex-direction: column;
    gap: 0.5rem;
  }
  .pads {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    width: 78%;
  }
  .pad {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.05rem;
    color: rgba(255, 255, 255, 0.7);
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--bcolor, var(--color-primary)) 35%, transparent);
    background: rgba(8, 14, 22, 0.9);
  }
  /* Light in sequence, then confirm green as the finger replays them */
  .p0 {
    animation: pad-seq 4s ease-in-out infinite;
    animation-delay: 0s;
  }
  .p1 {
    animation: pad-seq 4s ease-in-out infinite;
    animation-delay: 0.42s;
  }
  .p2 {
    animation: pad-seq 4s ease-in-out infinite;
    animation-delay: 0.84s;
  }
  @keyframes pad-seq {
    0%,
    2% {
      background: rgba(8, 14, 22, 0.9);
      border-color: color-mix(in srgb, var(--bcolor, var(--color-primary)) 35%, transparent);
      color: rgba(255, 255, 255, 0.7);
    }
    5%,
    11% {
      background: rgba(255, 215, 94, 0.32);
      border-color: #ffd75e;
      color: #ffd75e;
    }
    15%,
    52% {
      background: rgba(8, 14, 22, 0.9);
      border-color: color-mix(in srgb, var(--bcolor, var(--color-primary)) 35%, transparent);
      color: rgba(255, 255, 255, 0.7);
    }
    /* replay beat — the finger arrives here */
    56%,
    63% {
      background: rgba(77, 255, 136, 0.3);
      border-color: #4dff88;
      color: #4dff88;
    }
    68%,
    100% {
      background: rgba(8, 14, 22, 0.9);
      border-color: color-mix(in srgb, var(--bcolor, var(--color-primary)) 35%, transparent);
      color: rgba(255, 255, 255, 0.7);
    }
  }
  /* Finger walks the three pads in the same order they lit */
  .cascade-finger {
    top: 50%;
    left: 50%;
    animation: cascade-finger 4s ease-in-out infinite;
  }
  @keyframes cascade-finger {
    0%,
    50% {
      opacity: 0;
      transform: translate(-32%, -46%) scale(1.2);
    }
    55% {
      opacity: 0.95;
      transform: translate(-32%, -46%) scale(0.85);
    }
    60% {
      opacity: 0.95;
      transform: translate(-32%, -46%) scale(1);
    }
    65% {
      opacity: 0.95;
      transform: translate(32%, -46%) scale(1);
    }
    70% {
      opacity: 0.95;
      transform: translate(32%, -46%) scale(0.85);
    }
    76% {
      opacity: 0.95;
      transform: translate(0%, 6%) scale(1);
    }
    82% {
      opacity: 0.95;
      transform: translate(0%, 6%) scale(0.85);
    }
    92%,
    100% {
      opacity: 0;
      transform: translate(0%, 6%) scale(1);
    }
  }
  .cascade-watch {
    top: -2%;
    left: 50%;
    transform: translateX(-50%);
    background: #ffd75e;
    animation: watch-cue 4s ease-in-out infinite;
  }
  @keyframes watch-cue {
    0%,
    4% {
      opacity: 0;
    }
    8%,
    36% {
      opacity: 1;
    }
    44%,
    100% {
      opacity: 0;
    }
  }
  .cascade-repeat {
    top: -2%;
    left: 50%;
    transform: translateX(-50%);
    background: #4dff88;
    animation: repeat-cue 4s ease-in-out infinite;
  }
  @keyframes repeat-cue {
    0%,
    46% {
      opacity: 0;
    }
    52%,
    88% {
      opacity: 1;
    }
    94%,
    100% {
      opacity: 0;
    }
  }

  /* ============ CIRCUIT ROUTE ============ */
  .rail {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .port {
    font-size: 0.95rem;
    line-height: 1;
  }
  .src {
    color: #ffd75e;
    text-shadow: 0 0 8px rgba(255, 215, 94, 0.9);
  }
  .sink {
    color: rgba(255, 255, 255, 0.4);
    animation: sink-lit 3s ease-in-out infinite;
  }
  @keyframes sink-lit {
    0%,
    58% {
      color: rgba(255, 255, 255, 0.4);
      text-shadow: none;
    }
    68%,
    92% {
      color: #4dff88;
      text-shadow: 0 0 12px #4dff88;
    }
    100% {
      color: rgba(255, 255, 255, 0.4);
      text-shadow: none;
    }
  }
  .conduit {
    position: relative;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(16, 26, 40, 0.9);
  }
  .arm {
    position: absolute;
    top: calc(50% - 2px);
    left: 0;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.3);
  }
  .conduit.lit {
    border-color: color-mix(in srgb, var(--bcolor, var(--color-primary)) 60%, transparent);
  }
  .conduit.lit .arm {
    background: var(--bcolor, var(--color-primary));
    box-shadow: 0 0 6px var(--bcolor, var(--color-primary));
  }
  /* The blocking tile: starts vertical, the tap turns it horizontal */
  .conduit.turn .arm {
    animation: turn-arm 3s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
  }
  @keyframes turn-arm {
    0%,
    52% {
      transform: rotate(90deg);
      background: rgba(255, 255, 255, 0.3);
      box-shadow: none;
    }
    62%,
    92% {
      transform: rotate(0deg);
      background: var(--bcolor, var(--color-primary));
      box-shadow: 0 0 6px var(--bcolor, var(--color-primary));
    }
    100% {
      transform: rotate(90deg);
      background: rgba(255, 255, 255, 0.3);
      box-shadow: none;
    }
  }
  .conduit.turn {
    animation: turn-tile 3s ease-in-out infinite;
  }
  @keyframes turn-tile {
    0%,
    52% {
      border-color: rgba(255, 255, 255, 0.16);
    }
    62%,
    92% {
      border-color: color-mix(in srgb, var(--bcolor, var(--color-primary)) 60%, transparent);
    }
    100% {
      border-color: rgba(255, 255, 255, 0.16);
    }
  }
  .conduit.last .arm {
    animation: last-arm 3s ease-in-out infinite;
  }
  @keyframes last-arm {
    0%,
    58% {
      background: rgba(255, 255, 255, 0.3);
      box-shadow: none;
    }
    68%,
    92% {
      background: var(--bcolor, var(--color-primary));
      box-shadow: 0 0 6px var(--bcolor, var(--color-primary));
    }
    100% {
      background: rgba(255, 255, 255, 0.3);
      box-shadow: none;
    }
  }
  .route-finger {
    top: 50%;
    left: 50%;
    animation: route-finger 3s ease-in-out infinite;
  }
  @keyframes route-finger {
    0%,
    30% {
      opacity: 0;
      transform: translateY(14px) scale(1.2);
    }
    44% {
      opacity: 0.95;
      transform: translateY(0) scale(1);
    }
    52% {
      opacity: 0.95;
      transform: translateY(0) scale(0.82);
    }
    64%,
    100% {
      opacity: 0;
      transform: translateY(0) scale(1);
    }
  }
  .route-ripple {
    top: 50%;
    left: 50%;
    animation: ripple-pop 3s ease-out infinite;
  }
  .route-cue {
    top: 24%;
    left: 50%;
    transform: translateX(-50%);
    animation: cue-blink 3s ease-in-out infinite;
  }

  /* ============ GRID RUNNER ============ */
  .maze {
    position: relative;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 2px;
    width: 84%;
  }
  .cell {
    aspect-ratio: 1;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.05);
  }
  .cell.wall {
    background: rgba(120, 140, 175, 0.32);
  }
  /*
   * Positioned by transform, not by top/left, for the same percentage-basis
   * reason as .packet — but the trap here was worse. `left: %` resolves
   * against the container's WIDTH while `top: %` resolves against its HEIGHT,
   * and this maze is 6 wide by 4 tall (24 cells), so the two are not the same
   * number. The old `top` recomputed a "cell" from the short axis and landed
   * the exit roughly a full cell above the tile the packet finishes on.
   *
   * Anchoring at cell 0,0 and translating by whole pitches keeps one basis —
   * the element's own box, which is exactly one cell — for both axes.
   */
  .goal {
    --pitch: calc(100% + 2px); /* goal is a full cell wide, so just add the gap */
    position: absolute;
    width: calc((100% - 10px) / 6);
    aspect-ratio: 1;
    left: 0;
    top: 0;
    transform: translate(calc(var(--pitch) * 5), calc(var(--pitch) * 3));
    border-radius: 3px;
    background: rgba(77, 255, 136, 0.28);
    border: 1px solid #4dff88;
    animation: goal-pulse 1.4s ease-in-out infinite;
  }
  @keyframes goal-pulse {
    50% {
      box-shadow: 0 0 12px rgba(77, 255, 136, 0.9);
    }
  }
  /*
   * PITCH — the distance between two cell centres: one cell plus the grid's
   * 2px gap.
   *
   * The catch is that percentages inside `transform: translate()` resolve
   * against the ELEMENT'S OWN border box, not the grid's. The packet is
   * `cell - 4px` wide, so its `100%` is `cell - 4px` and `100% + 4px` is one
   * cell exactly — the gap was never added, every step fell 2px short, and the
   * error accumulated to a full 10px by the last column. That is the drift
   * that made the demo packet sit off its tiles.
   */
  .packet {
    --pitch: calc(100% + 6px); /* (cell - 4px) + 4px + 2px gap */
    position: absolute;
    width: calc((100% - 10px) / 6 - 4px);
    aspect-ratio: 1;
    left: 2px;
    top: 2px;
    border-radius: 50%;
    background: var(--bcolor, var(--color-primary));
    box-shadow: 0 0 10px var(--bcolor, var(--color-primary));
    /* Steps cell-to-cell, the way the real packet moves */
    animation: packet-run 4s steps(1, end) infinite;
  }
  @keyframes packet-run {
    0% {
      transform: translate(0, 0);
    }
    12% {
      transform: translate(calc(var(--pitch) * 1), 0);
    }
    24% {
      transform: translate(calc(var(--pitch) * 2), 0);
    }
    36% {
      transform: translate(calc(var(--pitch) * 2), calc(var(--pitch) * 1));
    }
    48% {
      transform: translate(calc(var(--pitch) * 3), calc(var(--pitch) * 1));
    }
    60% {
      transform: translate(calc(var(--pitch) * 3), calc(var(--pitch) * 2));
    }
    72% {
      transform: translate(calc(var(--pitch) * 4), calc(var(--pitch) * 2));
    }
    84% {
      transform: translate(calc(var(--pitch) * 5), calc(var(--pitch) * 2));
    }
    92%,
    100% {
      transform: translate(calc(var(--pitch) * 5), calc(var(--pitch) * 3));
    }
  }
  /* Same correction as .packet, offset by its own inset: the chaser is
     `cell - 6px` wide, so one pitch is 100% + 6px + the 2px gap. */
  .chaser {
    --pitch: calc(100% + 8px);
    position: absolute;
    width: calc((100% - 10px) / 6 - 6px);
    aspect-ratio: 1;
    left: 3px;
    top: 3px;
    border-radius: 50%;
    background: #ff3d55;
    box-shadow: 0 0 8px rgba(255, 61, 85, 0.9);
    transform: translate(calc(var(--pitch) * 5), 0);
    animation: chaser-run 4s steps(1, end) infinite;
  }
  @keyframes chaser-run {
    0% {
      transform: translate(calc(var(--pitch) * 5), 0);
    }
    30% {
      transform: translate(calc(var(--pitch) * 4), 0);
    }
    60% {
      transform: translate(calc(var(--pitch) * 3), 0);
    }
    100% {
      transform: translate(calc(var(--pitch) * 3), calc(var(--pitch) * 1));
    }
  }
  /* Swipe streak: a short dash that sweeps right, the gesture spelled out */
  .swipe {
    position: absolute;
    left: 26%;
    top: 76%;
    width: 34px;
    height: 5px;
    border-radius: var(--r-pill);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.95));
    opacity: 0;
    animation: swipe-move 4s ease-in-out infinite;
  }
  @keyframes swipe-move {
    0%,
    6% {
      opacity: 0;
      transform: translateX(-14px);
    }
    14% {
      opacity: 1;
    }
    30% {
      opacity: 1;
      transform: translateX(34px);
    }
    40%,
    100% {
      opacity: 0;
      transform: translateX(34px);
    }
  }
  .runner-cue {
    top: 88%;
    left: 50%;
    transform: translateX(-50%);
    animation: runner-cue 4s ease-in-out infinite;
  }
  @keyframes runner-cue {
    0%,
    4% {
      opacity: 0;
    }
    12%,
    32% {
      opacity: 1;
    }
    42%,
    100% {
      opacity: 0;
    }
  }

  /* A looping demo is decoration; freeze it on the first, most legible
     frame rather than flashing states at someone who asked for less motion. */
  @media (prefers-reduced-motion: reduce) {
    .demo :global(*) {
      animation: none !important;
    }
    .finger,
    .cue {
      opacity: 0.9;
    }
    .conduit.turn .arm {
      transform: rotate(0deg);
    }
  }
</style>
