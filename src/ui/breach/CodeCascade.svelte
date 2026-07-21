<script lang="ts">
  // CODE CASCADE — cipher memory: watch the glyph sequence flash across the
  // keypad, then replay it by tapping. Rounds grow longer; high security
  // SHUFFLES the keypad between rounds so you memorize glyphs, not spots.
  import { onMount } from 'svelte';

  interface Props {
    sec: number;
    overclock: boolean;
    mercy: boolean; // BYTE: absorb one wrong tap
    running: boolean;
    shuffle: boolean;
    win: () => void;
    flash: (msg: string) => void;
    penalty: (seconds: number) => void;
  }
  let { sec, overclock, mercy, running, shuffle, win, flash, penalty }: Props = $props();

  const GLYPHS = ['◆', '▲', '●', '★', '✚', '☰', '⚡', '◼', '☾'];
  const rounds = 2 + (sec >= 2 ? 1 : 0) + (overclock ? 1 : 0);
  const doShuffle = shuffle || sec >= 2;
  const showMs = Math.max(260, 520 - sec * 70);

  let pads = $state([...GLYPHS]);
  let round = $state(0);
  let sequence = $state<string[]>([]);
  let showIdx = $state(-1); // which sequence step is flashing
  let inputIdx = $state(0);
  let mode = $state<'show' | 'input' | 'gap'>('gap');
  let padFlash = $state<{ glyph: string; kind: 'good' | 'bad' } | null>(null);
  let mercyLeft = mercy;
  let done = false;
  let timers: ReturnType<typeof setTimeout>[] = [];

  function later(fn: () => void, ms: number): void {
    timers.push(setTimeout(fn, ms));
  }

  function lenFor(r: number): number {
    return 3 + Math.ceil(sec / 2) + r;
  }

  function shufflePads(): void {
    pads = [...pads].sort(() => Math.random() - 0.5);
  }

  function startRound(): void {
    if (done) return;
    sequence = Array.from(
      { length: lenFor(round) },
      () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    );
    if (doShuffle && round > 0) {
      shufflePads();
      flash('KEYPAD SCRAMBLED');
    }
    playback();
  }

  function playback(): void {
    mode = 'show';
    inputIdx = 0;
    showIdx = -1;
    sequence.forEach((_, i) => {
      later(() => (showIdx = i), 350 + i * showMs);
    });
    later(
      () => {
        showIdx = -1;
        mode = 'input';
      },
      350 + sequence.length * showMs + 150,
    );
  }

  function tapPad(glyph: string): void {
    if (!running || done || mode !== 'input') return;
    if (glyph === sequence[inputIdx]) {
      padFlash = { glyph, kind: 'good' };
      later(() => (padFlash = null), 180);
      inputIdx++;
      if (inputIdx >= sequence.length) {
        round++;
        if (round >= rounds) {
          done = true;
          win();
          return;
        }
        mode = 'gap';
        flash(`CIPHER ${round}/${rounds} DECODED`);
        later(startRound, 750);
      }
    } else {
      padFlash = { glyph, kind: 'bad' };
      later(() => (padFlash = null), 260);
      if (mercyLeft) {
        mercyLeft = false;
        flash('BYTE BUFFER — ERROR ABSORBED');
        return;
      }
      penalty(2);
      flash('CHECKSUM FAIL — REPLAYING');
      mode = 'gap';
      later(playback, 650);
    }
  }

  // Wait for the shell's intro to finish before the first playback
  let started = false;
  $effect(() => {
    if (running && !started) {
      started = true;
      startRound();
    }
  });

  onMount(() => () => timers.forEach(clearTimeout));
</script>

<div class="cc-wrap">
  <div class="cc-status">
    {#if mode === 'show'}
      <span class="watching">▶ MEMORIZE THE SEQUENCE</span>
    {:else if mode === 'input'}
      <span class="typing">⌨ ENTER {sequence.length - inputIdx} MORE</span>
    {:else}
      <span class="idle">CIPHER {Math.min(round + 1, rounds)}/{rounds}</span>
    {/if}
  </div>

  <div class="cc-seq">
    {#each sequence as g, i (i)}
      <span
        class="seq-dot"
        class:lit={mode === 'show' && showIdx === i}
        class:got={mode === 'input' && i < inputIdx}
      >
        {mode === 'show' && showIdx === i ? g : mode === 'input' && i < inputIdx ? g : '·'}
      </span>
    {/each}
  </div>

  <div class="cc-pads">
    {#each pads as g (g)}
      <button
        class="pad"
        class:lit={mode === 'show' && sequence[showIdx] === g}
        class:good={padFlash?.glyph === g && padFlash.kind === 'good'}
        class:bad={padFlash?.glyph === g && padFlash.kind === 'bad'}
        disabled={mode !== 'input'}
        onpointerdown={() => tapPad(g)}>{g}</button
      >
    {/each}
  </div>
</div>

<style>
  .cc-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    aspect-ratio: 13 / 9;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    padding: 0.6rem;
  }

  .cc-status {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    height: 1rem;
  }
  .watching {
    color: #ffd75e;
  }
  .typing {
    color: var(--bcolor);
  }
  .idle {
    color: rgba(255, 255, 255, 0.55);
  }

  .cc-seq {
    display: flex;
    gap: 0.35rem;
    min-height: 1.7rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .seq-dot {
    width: 1.6rem;
    height: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.45);
  }
  .seq-dot.lit {
    border-color: #ffd75e;
    color: #ffd75e;
    box-shadow: 0 0 10px rgba(255, 215, 94, 0.6);
  }
  .seq-dot.got {
    border-color: var(--bcolor);
    color: var(--bcolor);
  }

  .cc-pads {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.45rem;
  }
  .pad {
    width: min(17vw, 3.6rem);
    aspect-ratio: 1;
    font-size: 1.35rem;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--bcolor) 40%, transparent);
    background: color-mix(in srgb, var(--bcolor) 9%, rgba(8, 14, 22, 0.9));
    color: #fff;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background 0.12s,
      box-shadow 0.12s;
  }
  .pad:disabled {
    cursor: default;
    opacity: 0.85;
  }
  .pad.lit {
    background: color-mix(in srgb, #ffd75e 40%, rgba(8, 14, 22, 0.9));
    border-color: #ffd75e;
    box-shadow: 0 0 14px rgba(255, 215, 94, 0.7);
  }
  .pad.good {
    background: color-mix(in srgb, #4dff88 30%, rgba(8, 14, 22, 0.9));
    border-color: #4dff88;
  }
  .pad.bad {
    background: color-mix(in srgb, #ff3d3d 35%, rgba(8, 14, 22, 0.9));
    border-color: #ff3d3d;
  }
</style>
