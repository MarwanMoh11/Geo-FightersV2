<script lang="ts">
  /**
   * Contextual, one-time tips.
   *
   * The game has a lot of systems — overclock, breach nodes, exploits,
   * evolutions, chests, the boss, endless — and none of them explained
   * themselves. Front-loading all of that into the first-run briefing would
   * just make a longer wall nobody reads, so each idea is instead taught the
   * first moment it becomes relevant, once, ever.
   *
   * This component is purely observational: it watches `uiState` and never
   * touches a game system, so triggers can be added or removed without any
   * risk to simulation code. Tips queue rather than stack, never block input,
   * and are suppressed while any modal owns the screen.
   */
  import { uiState, saveLocal } from '../core/UIState.svelte.ts';
  import { fly } from 'svelte/transition';
  import { haptics } from '../core/haptics';

  interface Tip {
    id: string;
    icon: string;
    title: string;
    body: string;
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
  }

  /* One at a time, with a beat between, so two triggers in the same frame
     don't collapse into one unreadable flash. */
  $effect(() => {
    if (current || queue.length === 0) return;
    // Never talk over a modal — it owns the screen and the player's attention.
    if (
      uiState.showUpgrade ||
      uiState.showChestCeremony ||
      uiState.showProtocolChoice ||
      uiState.showSecondChance ||
      uiState.showVictoryChoice ||
      uiState.showOnboarding ||
      uiState.showHowTo ||
      uiState.breach ||
      uiState.gameState !== 'PLAYING'
    ) {
      return;
    }
    const next = queue.shift();
    if (!next) return;
    current = next ?? null;
    haptics.select();
    hideTimer = setTimeout(dismiss, 7000);
  });

  $effect(() => () => clearTimeout(hideTimer));

  // ---- Triggers: each reads state only, and fires at most once ever ----

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.overloadCharge >= 100 && !uiState.overloadActive) {
      offer({
        id: 'overclock',
        icon: '⚡',
        title: 'Overclock is charged',
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
        body: 'Jack in to run a quick hack for gear. Higher security means a harder hack and a better payout.',
      });
    }
  });

  $effect(() => {
    if (uiState.gameState !== 'PLAYING') return;
    if (uiState.exploitSlots.some((s) => !!s)) {
      offer({
        id: 'exploit',
        icon: '💀',
        title: 'Exploit installed',
        body: "Exploits rewrite a rule of the run rather than adding numbers. You can hold three.",
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
        body: 'Max a weapon, hold its partner passive, then open a chest to evolve it. Check Evolutions from the pause menu.',
      });
    }
  });
</script>

{#if current}
  <div class="coach" transition:fly={{ y: 18, duration: 260 }} role="status" aria-live="polite">
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
  .coach {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    /* Clear of the loadout bar AND the Overclock button (which sits at
       bottom 7.5rem and is ~4.2rem tall) — an overlapping tip covering the
       very button it is telling you to press would be self-defeating. The
       percentage cap keeps it on-screen on short landscape phones. */
    bottom: min(calc(var(--safe-bottom) + 12.2rem), 46%);
    z-index: var(--z-coach);
    width: min(92vw, 25rem);
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.75rem 0.85rem;
    border-radius: var(--r-lg);
    background: rgba(8, 13, 23, 0.94);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid var(--color-border-bright);
    box-shadow:
      var(--elev-2),
      0 0 26px -12px rgba(54, 230, 255, 0.9);
    pointer-events: auto;
    overflow: hidden;
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
    animation: coach-countdown 7s linear forwards;
  }
  @keyframes coach-countdown {
    to {
      transform: scaleX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .coach-timer {
      animation: none;
      opacity: 0.4;
    }
  }
</style>
