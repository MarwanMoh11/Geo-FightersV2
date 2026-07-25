<script lang="ts">
  /** Mutually-exclusive choice row (quality, fps cap). Arrow-key navigable
      like a real radio group, and every segment is a 44px target. */
  import { playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';

  interface Option<T> {
    value: T;
    label: string;
  }

  interface Props<T> {
    value: T;
    options: Option<T>[];
    label: string;
    id?: string;
    onchange: (next: T) => void;
  }

  let { value, options, label, id, onchange }: Props<any> = $props();

  function pick(next: unknown) {
    if (next === value) return;
    playMenuClick();
    haptics.select();
    onchange(next);
  }

  function onKeydown(e: KeyboardEvent) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    pick(options[(i + dir + options.length) % options.length].value);
  }
</script>

<div {id} class="segmented" role="radiogroup" aria-label={label}>
  {#each options as opt (String(opt.value))}
    <button
      type="button"
      class="seg"
      class:active={opt.value === value}
      role="radio"
      aria-checked={opt.value === value}
      tabindex={opt.value === value ? 0 : -1}
      onclick={() => pick(opt.value)}
      onkeydown={onKeydown}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: var(--r-md);
    background: var(--surface-sunken);
    border: 1px solid var(--color-border);
  }
  .seg {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    flex: 1;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.4rem;
    border-radius: var(--r-sm);
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
    text-align: center;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast);
  }
  .seg:hover {
    color: var(--color-text-main);
  }
  .seg.active {
    background: rgba(54, 230, 255, 0.14);
    color: var(--color-primary);
    box-shadow: inset 0 0 0 1px rgba(54, 230, 255, 0.35);
  }
</style>
