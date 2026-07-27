<script lang="ts">
  /**
   * The one overlay shell every menu shares.
   *
   * Form follows the device rather than scaling one shape to fit both:
   *   - phones  → bottom sheet, full width, grab handle, slides up from the
   *               thumb zone; the primary action sits in a sticky footer so it
   *               can never end up under the browser toolbar or home bar.
   *   - desktop → centred card with a scale-in, capped measure, hover states
   *               and ESC/Tab handling that a keyboard user expects.
   *
   * Layout is always sticky-header / scrolling body / sticky footer, so no
   * content is ever unreachable and no CTA is ever below the fold.
   */
  import type { Snippet } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { playMenuClick } from '../core/audio';
  import { haptics } from '../core/haptics';

  interface Props {
    open?: boolean;
    /** Small tracked label above the title. */
    eyebrow?: string;
    title?: string;
    subtitle?: string;
    /** Accent colour for the header rule + eyebrow. */
    tone?: 'cyan' | 'pink' | 'gold' | 'green';
    /** Desktop card width. */
    size?: 'sm' | 'md' | 'lg';
    /** Show the ✕ button and allow ESC / backdrop to close. */
    dismissible?: boolean;
    /** Clicking the scrim closes. Off by default — most game modals demand a choice. */
    backdropClose?: boolean;
    /** Renders the body edge-to-edge (ceremony/art modals supply their own padding). */
    flush?: boolean;
    class?: string;
    onclose?: () => void;
    /** Right-aligned readout in the header (credits, counts, version). */
    readout?: Snippet;
    children?: Snippet;
    /** Sticky action bar. Put the primary CTA here — it stays on-screen. */
    footer?: Snippet;
  }

  let {
    open = true,
    eyebrow = '',
    title = '',
    subtitle = '',
    tone = 'cyan',
    size = 'md',
    dismissible = true,
    backdropClose = false,
    flush = false,
    class: extraClass = '',
    onclose,
    readout,
    children,
    footer,
  }: Props = $props();

  let panelEl = $state<HTMLDivElement | null>(null);

  /* Sheet on phones, card on desktop. Tracked live so a rotate or a resized
     desktop window swaps the transition and layout without a remount. */
  let isSheet = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => (isSheet = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  function close() {
    if (!dismissible) return;
    playMenuClick();
    haptics.select();
    onclose?.();
  }

  const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /* Move focus into the dialog on open so keyboard and screen-reader users
     start inside it, and remember where they came from to restore after.
     Focus lands on the dialog container rather than the first control —
     otherwise the ✕ button gets the focus ring and visually shouts "leave"
     the instant a panel opens. Tab still walks the content from the top. */
  $effect(() => {
    if (!open || !panelEl) return;
    const previous = document.activeElement as HTMLElement | null;
    panelEl.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !panelEl) return;
    // Focus trap: Tab must not escape into the game behind the modal.
    const items = Array.from(panelEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <div class="modal-root {extraClass}" class:as-sheet={isSheet} transition:fade={{ duration: 160 }}>
    <!-- Scrim. Only a real button when it does something, so assistive tech
         isn't told about a control that ignores it. -->
    {#if backdropClose && dismissible}
      <button class="scrim" aria-label="Close" onclick={close}></button>
    {:else}
      <div class="scrim" aria-hidden="true"></div>
    {/if}

    <div
      bind:this={panelEl}
      class="panel sheet tone-{tone} size-{size}"
      class:flush
      role="dialog"
      aria-modal="true"
      aria-label={title || eyebrow || 'Dialog'}
      tabindex="-1"
      onkeydown={onKeydown}
      in:fly|global={isSheet
        ? { y: 320, duration: 340, opacity: 1 }
        : { y: 0, duration: 0, opacity: 1 }}
      out:fly|global={isSheet ? { y: 320, duration: 220 } : { y: 0, duration: 0 }}
    >
      <div
        class="panel-inner"
        in:scale|global={isSheet ? { duration: 0, start: 1 } : { duration: 240, start: 0.94 }}
      >
        {#if isSheet}
          <div class="grab" aria-hidden="true"></div>
        {/if}

        {#if title || eyebrow || readout || dismissible}
          <header class="head">
            <div class="ui-head">
              <div class="ui-head-text">
                {#if eyebrow}<span class="eyebrow accent">{eyebrow}</span>{/if}
                {#if title}<h2 class="ui-title">{title}</h2>{/if}
                {#if subtitle}<p class="ui-sub">{subtitle}</p>{/if}
              </div>
              <div class="head-right">
                {#if readout}{@render readout()}{/if}
                {#if dismissible}
                  <button class="ui-icon-btn close" onclick={close} aria-label="Close">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          </header>
        {/if}

        <div class="body menu-scroll" class:flush>
          {@render children?.()}
        </div>

        {#if footer}
          <footer class="foot">
            {@render footer()}
          </footer>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-root {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    font-family: var(--font-body);
  }

  .scrim {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    background: var(--scrim);
    backdrop-filter: blur(10px) saturate(105%);
    -webkit-backdrop-filter: blur(10px) saturate(105%);
    cursor: default;
  }

  /* ---- Panel ---- */
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: var(--modal-max-h);
    border-radius: var(--r-xl);
    outline: none;
    overflow: hidden;
  }
  .panel.size-sm {
    max-width: 25rem;
  }
  .panel.size-md {
    max-width: 34rem;
  }
  .panel.size-lg {
    max-width: 48rem;
  }

  .panel-inner {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: inherit;
  }

  /* Accent hairline that colour-codes the modal's intent */
  .panel::after {
    content: '';
    position: absolute;
    top: 0;
    left: 12%;
    right: 12%;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--tone-color), transparent);
    opacity: 0.85;
  }
  .tone-cyan {
    --tone-color: var(--color-primary);
  }
  .tone-pink {
    --tone-color: var(--color-secondary);
  }
  .tone-gold {
    --tone-color: var(--color-gold);
  }
  .tone-green {
    --tone-color: var(--color-accent);
  }

  /* ---- Header (sticky) ---- */
  .head {
    flex: 0 0 auto;
    padding: var(--sp-5) var(--gutter) var(--sp-3);
    border-bottom: 1px solid var(--color-border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent);
  }
  .eyebrow.accent {
    color: var(--tone-color);
  }
  .head-right {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 0 auto;
  }

  /* ---- Body (the only scrolling region) ---- */
  .body {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--sp-4) var(--gutter);
  }
  .body.flush {
    padding: 0;
  }

  /* ---- Footer action bar (sticky) ---- */
  .foot {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--gutter);
    padding-bottom: max(var(--sp-3), var(--safe-bottom));
    border-top: 1px solid var(--color-border);
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.28), transparent);
  }
  /* Buttons in the action bar share the row evenly by default */
  .foot :global(.ui-btn) {
    flex: 1;
  }

  /* ==============================================================
     PHONE — bottom sheet
     ============================================================== */
  .as-sheet {
    align-items: flex-end;
  }
  .as-sheet .panel {
    max-width: none;
    max-height: min(92dvh, 100dvh - var(--safe-top) - 8px);
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    border-bottom: none;
    margin-left: var(--safe-left);
    margin-right: var(--safe-right);
  }
  .grab {
    flex: 0 0 auto;
    width: 40px;
    height: 4px;
    margin: 0.55rem auto 0;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.22);
  }
  .as-sheet .head {
    padding-top: var(--sp-3);
  }

  /* ==============================================================
     DESKTOP — centred card
     ============================================================== */
  @media (min-width: 641px) {
    .modal-root {
      padding: var(--pad-top) var(--pad-right) var(--pad-bottom) var(--pad-left);
    }
  }
</style>
