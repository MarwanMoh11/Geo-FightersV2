<script lang="ts">
  /** Range input with a visible fill and a thumb big enough to grab with a
      thumb. The native track is kept (free a11y + keyboard) and restyled;
      the fill is painted as a gradient driven by the live value. */
  import { haptics } from '../../core/haptics';

  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    id?: string;
    /** Rendered next to the label, e.g. "80%". */
    display?: string;
    oninput: (next: number) => void;
  }

  let { value, min = 0, max = 100, step = 1, label, id, display, oninput }: Props = $props();

  let pct = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);
  let lastTick: number | null = null;

  function handle(e: Event & { currentTarget: HTMLInputElement }) {
    const next = Number(e.currentTarget.value);
    if (lastTick === null) lastTick = next;
    // A short tick every ~10% gives the drag some physicality on mobile.
    if (Math.abs(next - lastTick) >= (max - min) / 10) {
      lastTick = next;
      haptics.select();
    }
    oninput(next);
  }
</script>

<div class="slider-row">
  <div class="slider-head">
    <label for={id}>{label}</label>
    {#if display}<span class="val tnum">{display}</span>{/if}
  </div>
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    style="--pct: {pct}%"
    oninput={handle}
  />
</div>

<style>
  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .slider-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
  }
  label {
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--color-text-main);
  }
  .val {
    font-size: var(--fs-caption);
    font-weight: 700;
    color: var(--color-primary);
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    /* Tall transparent box = comfortable grab area; the visible track is
       painted with a background gradient inside it. */
    height: 28px;
    margin: 0;
    background: transparent;
    outline: none;
    touch-action: pan-y;
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: var(--r-pill);
    background: linear-gradient(
      90deg,
      var(--color-primary) 0%,
      var(--color-primary) var(--pct),
      rgba(255, 255, 255, 0.1) var(--pct),
      rgba(255, 255, 255, 0.1) 100%
    );
  }
  input[type='range']::-moz-range-track {
    height: 6px;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.1);
  }
  input[type='range']::-moz-range-progress {
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--color-primary);
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    margin-top: -7px;
    border: 2px solid #04060f;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 0 12px -1px rgba(54, 230, 255, 0.9);
    transition: transform var(--transition-fast);
  }
  input[type='range']::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border: 2px solid #04060f;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 0 12px -1px rgba(54, 230, 255, 0.9);
  }
  input[type='range']:active::-webkit-slider-thumb {
    transform: scale(1.18);
  }
</style>
