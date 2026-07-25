<script lang="ts">
  /** One labelled setting: title, optional hint, and a control on the right
      (inline) or beneath (stacked, for sliders/segmented). */
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    hint?: string;
    /** `inline` puts the control on the right; `stack` puts it underneath. */
    layout?: 'inline' | 'stack';
    children?: Snippet;
  }

  let { label = '', hint = '', layout = 'inline', children }: Props = $props();
</script>

<div class="row {layout}">
  {#if label}
    <div class="text">
      <span class="name">{label}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </div>
  {/if}
  <div class="control">{@render children?.()}</div>
</div>

<style>
  .row {
    display: flex;
    gap: var(--sp-3);
    padding: 0.7rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .row:last-child {
    border-bottom: none;
  }
  .row.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .row.stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .name {
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--color-text-main);
  }
  .hint {
    font-size: var(--fs-caption);
    line-height: 1.4;
    color: var(--color-text-dim);
  }
  .row.inline .control {
    flex: 0 0 auto;
  }
</style>
