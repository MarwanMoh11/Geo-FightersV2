<script lang="ts">
  /**
   * Contextual, one-time tips — anchored to the thing they describe.
   *
   * The game has a lot of systems (overclock, breach nodes, exploits,
   * evolutions, the boss) and none of them explained themselves. Rather than
   * front-loading all of it into a briefing nobody reads, each idea is taught
   * the first moment it becomes relevant, once, ever.
   *
   * Crucially the tip does not just *describe* the thing — it points at it.
   * A spotlight ring is measured onto the real HUD element and the card is
   * placed beside it with a connector, the way a blockbuster tutorial calls
   * out a new button. Telling a new player "the meter under your health is
   * charged" is a sentence they have to solve; ringing the meter is not.
   *
   * This component is purely observational: it watches `uiState` and never
   * touches a game system, so triggers can be added or removed without any
   * risk to simulation code.
   */
  import { uiState, saveLocal } from '../core/UIState.svelte.ts';
  import { fly } from 'svelte/transition';
  import { haptics } from '../core/haptics';

  interface Tip {
    id: string;
    icon: string;
    title: string;
    body: string;
    /** Candidate CSS selectors for the element to spotlight, best first.
        Svelte keeps original class names and only *adds* a scope class, so
        plain component selectors resolve fine from here. */
    anchor?: string[];
  }

  const SEEN_PREFIX = 'geo_tip_';

  function alreadySeen(id: string): boolean {
    try {
      return localStorage.getItem(SEEN_PREFIX + id) === '1';
    } catch {
      return false;
    }
  }

  let queue = $state<Tip[]>([]);
  let current = $state<Tip | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  // Measured rect of the spotlighted element (null = unanchored, centre card)
  let spot = $state<{ x: number; y: number; w: number; h: number } | null>(null);

  // Tips fired this session, so a value that oscillates can't re-queue one.
  const fired = new Set<string>();

  function offer(tip: Tip) {
    if (fired.has(tip.id) || alreadySeen(tip.id)) return;
    fired.add(tip.id);
    saveLocal(SEEN_PREFIX + tip.id, '1');
    queue.push(tip);
  }

  function dismiss() {
    clearTimeout(hideTimer);
    current = null;
    spot = null;
  }

  /** Measure the first anchor that actually exists and is on screen. */
  function measure(tip: Tip | null) {
    if (!tip?.anchor) return null;
    for (const sel of tip.anchor) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      // Pad the ring so it frames the element rather than clipping it
      const pad = 8;
      return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    }
    return null;
  }

  /* Anything that owns the screen. A tip must neither start nor survive
     while one of these is up. */
  const blocked = $derived(
    uiState.showUpgrade ||
      uiState.showChestCeremony ||
      uiState.showProtocolChoice ||
      uiState.showSecondChance ||
      uiState.showVictoryChoice ||
      uiState.showOnboarding ||
      uiState.showHowTo ||
      !!uiState.exploitTutorial ||
      !!uiState.breach ||
      uiState.gameState !== 'PLAYING',
  );

  /* Retract on interruption, and put the tip BACK in the queue.
     Gating only the *start* of a tip left an already-visible one stranded:
     level up mid-tip and the spotlight ring — which sits above the modal
     layer so it can highlight HUD chrome — kept glowing over the upgrade
     card, ringing nothing.

     It re-queues rather than dismissing because `offer()` already wrote the
     seen-flag; a plain dismiss would burn the one showing this tip ever
     gets. Interrupted after half a second, you still get it afterwards. */
  $effect(() => {
    if (!blocked || !current) return;
    clearTimeout(hideTimer);
    queue.unshift(current);
    current = null;
    spot = null;
  });

  /* One at a time, with a beat between, so two triggers in the same frame
     don't collapse into one unreadable flash. */
  $effect(() => {
    if (current || queue.length === 0 || blocked) return;
    const next = queue.shift();
    if (!next) return;
    current = next ?? null;
    spot = measure(next);
    haptics.select();
    hideTimer = setTimeout(dismiss, 8000);
  });

  // Keep the ring on target through rotation / resize / HUD reflow.
  $effect(() => {
    if (!current) return;
    const sync = () => (spot = measure(current));
    window.addEventListener('resize', sync);
    const poll = setInterval(sync, 500);
    return () => {
      window.removeEventListener('resize', sync);
      clearInterval(poll);
    };
  });

  $effect(() => () => clearTimeout(hideTimer));

  /* Card sits on the far side of the anchor from the screen edge it hugs,
     clamped so it can never hang off. Unanchored tips fall back to the
     lower third, clear of the loadout bar and the Overclock button. */
  const placement = $derived.by(() => {
    if (!spot) return { style: '', side: 'none' as const };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const below = spot.y + spot.h + 14;
    const above = spot.y - 14;
    // Prefer whichever side has more room for a ~120px card
    const useBelow = below < vh * 0.55 || above < 150;

    /* The card stays horizontally centred (it's the most readable position
       on a phone), so the connector notch slides along its edge to line up
       with the anchor instead. Without this the arrow points at the middle
       of the screen while the ring is off in a corner. */
    const cardW = Math.min(vw * 0.92, 400);
    const cardLeft = vw / 2 - cardW / 2;
    const anchorCx = spot.x + spot.w / 2;
    const arrowX = Math.max(18, Math.min(cardW - 18, anchorCx - cardLeft));

    const style =
      (useBelow ? `top:${below}px;` : `bottom:${Math.max(8, vh - above)}px;`) +
      `--arrow-x:${arrowX}px;`;
    return { style, side: useBelow ? ('below' as const) : ('above' as const) };
  });

  // ---- Triggers: each reads state only, and fires at most once ever ----

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.overloadCharge >= 100 && !uiState.overloadActive) {
      offer({
        id: 'overclock',
        icon: '⚡',
        title: 'Overclock is charged',
        // Ring the button on touch, the meter on desktop where there is none.
        anchor: ['.overload-btn', '.overload'],
        body: 'A short burst of overwhelming firepower. Save it for when the horde closes in.',
      });
    }
  });

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.breachPrompt) {
      offer({
        id: 'breach',
        icon: '🔓',
        title: 'You found a data node',
        anchor: ['.breach-prompt'],
        body: 'Jack in to run a quick hack for gear. Higher security means a harder hack and a better payout.',
      });
    }
  });

  /* The FIRST rootkit is taught by ExploitUnlockModal, which is a full stop —
     this tip would just repeat it a beat later. It fires on the SECOND one
     instead, where the actual lesson is stacking. */
  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.exploitSlots.filter((s) => !!s).length >= 2) {
      offer({
        id: 'exploit_stack',
        icon: '💀',
        title: 'Two rules running',
        anchor: ['.loadout'],
        body: 'Rootkits compound — ricochet feeding a chain, pools under a pierce proc. Find the third and the combination is your whole endless build.',
      });
    }
  });

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.bossHealth.active) {
      offer({
        id: 'boss',
        icon: '⚠️',
        title: 'Firewall awake',
        anchor: ['.boss'],
        body: 'Keep circling and let your weapons work. Bring it down to clear the run.',
      });
    }
  });

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.combo >= 25) {
      offer({
        id: 'combo',
        icon: '🔥',
        title: 'Combo chain',
        anchor: ['.combo'],
        body: 'Fast consecutive kills build a chain. Keep it alive by never letting the horde thin out around you.',
      });
    }
  });

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.weaponSlots.some((w) => w.level >= 8)) {
      offer({
        id: 'evolve',
        icon: '📖',
        title: 'A weapon is nearly maxed',
        anchor: ['.loadout'],
        body: 'Max a weapon, hold its partner passive, then open a chest to evolve it. Recipes are under Evolutions.',
      });
    }
  });
</script>

{#if current}
  <!-- Spotlight ring on the real element -->
  {#if spot}
    <div
      class="spot"
      style="left:{spot.x}px; top:{spot.y}px; width:{spot.w}px; height:{spot.h}px;"
      aria-hidden="true"
    >
      <span class="spot-ring"></span>
      <span class="spot-pulse"></span>
    </div>
  {/if}

  <div
    class="coach"
    class:anchored={!!spot}
    class:above={placement.side === 'above'}
    class:below={placement.side === 'below'}
    style={placement.style}
    transition:fly={{ y: 18, duration: 260 }}
    role="status"
    aria-live="polite"
  >
    {#if spot}<span class="arrow" aria-hidden="true"></span>{/if}
    <span class="coach-icon" aria-hidden="true">{current.icon}</span>
    <div class="coach-text">
      <span class="coach-title">{current.title}</span>
      <span class="coach-body">{current.body}</span>
    </div>
    <button class="coach-close" onclick={dismiss} aria-label="Dismiss tip">✕</button>
    <div class="coach-timer"></div>
  </div>
{/if}

<style>
  /* ---------- spotlight ---------- */
  .spot {
    position: fixed;
    z-index: calc(var(--z-coach) - 1);
    pointer-events: none;
    border-radius: var(--r-md);
  }
  .spot-ring,
  .spot-pulse {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 2px solid var(--color-primary);
  }
  .spot-ring {
    box-shadow:
      0 0 18px rgba(54, 230, 255, 0.85),
      inset 0 0 14px rgba(54, 230, 255, 0.35);
  }
  /* Expanding echo — the "look here" beat */
  .spot-pulse {
    animation: spot-echo 1.7s ease-out infinite;
  }
  @keyframes spot-echo {
    0% {
      opacity: 0.85;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.28);
    }
  }

  /* ---------- card ---------- */
  .coach {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    /* Unanchored default: clear of the loadout bar, its evolution banner and
       the ⚡ button */
    bottom: min(calc(var(--safe-bottom) + 13.6rem), 46%);
    z-index: var(--z-coach);
    width: min(92vw, 25rem);
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.75rem 0.85rem;
    border-radius: var(--r-lg);
    background: rgba(8, 13, 23, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid var(--color-border-bright);
    box-shadow:
      var(--elev-2),
      0 0 26px -12px rgba(54, 230, 255, 0.9);
    pointer-events: auto;
    overflow: hidden;
  }
  /* When anchored, `top`/`bottom` come from the inline placement style */
  .coach.anchored {
    bottom: auto;
  }
  .coach.anchored.above {
    top: auto;
  }

  /* Connector notch pointing back at the ringed element */
  .arrow {
    position: absolute;
    left: var(--arrow-x, 50%);
    width: 12px;
    height: 12px;
    margin-left: -6px;
    background: rgba(8, 13, 23, 0.96);
    border: 1px solid var(--color-border-bright);
    transform: rotate(45deg);
  }
  .coach.below .arrow {
    top: -7px;
    border-right: none;
    border-bottom: none;
  }
  .coach.above .arrow {
    bottom: -7px;
    border-left: none;
    border-top: none;
  }

  .coach-icon {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    font-size: 1.05rem;
    border-radius: var(--r-sm);
    background: rgba(54, 230, 255, 0.12);
  }

  .coach-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .coach-title {
    font-size: var(--fs-label);
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--color-primary);
  }
  .coach-body {
    font-size: var(--fs-caption);
    line-height: 1.45;
    color: var(--color-text-dim);
  }

  .coach-close {
    all: unset;
    flex: 0 0 auto;
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    font-size: 0.75rem;
    color: var(--color-text-faint);
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .coach-close:hover {
    color: var(--color-text-main);
    background: rgba(255, 255, 255, 0.06);
  }

  /* Visible countdown so the card never feels like it vanished at random */
  .coach-timer {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 100%;
    background: var(--color-primary);
    transform-origin: left center;
    animation: coach-countdown 8s linear forwards;
  }
  @keyframes coach-countdown {
    to {
      transform: scaleX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .coach-timer,
    .spot-pulse {
      animation: none;
    }
    .spot-pulse {
      opacity: 0;
    }
  }
</style>
