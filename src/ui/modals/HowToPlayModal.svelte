<script lang="ts">
  /**
   * The reference the first-run briefing deliberately doesn't try to be.
   *
   * Reachable from the main menu and from the pause screen, so a player who
   * skipped onboarding, came back a month later, or just met a system they
   * don't recognise is never stranded. Controls adapt to the device rather
   * than listing keys to someone holding a phone.
   */
  import { uiState } from '../../core/UIState.svelte.ts';
  import { playMenuClick } from '../../core/audio';
  import Modal from '../Modal.svelte';
  import TutorialDemo from '../breach/TutorialDemo.svelte';

  let tab = $state<'controls' | 'loop' | 'systems'>('controls');

  const TABS = [
    { id: 'controls', label: 'Controls' },
    { id: 'loop', label: 'The run' },
    { id: 'systems', label: 'Systems' },
  ] as const;

  const isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  function close() {
    playMenuClick();
    uiState.showHowTo = false;
  }
</script>

<Modal
  open={uiState.showHowTo}
  eyebrow="Reference"
  title="How to play"
  size="md"
  tone="cyan"
  backdropClose
  onclose={close}
>
  <div class="ui-tabs" role="tablist" aria-label="How to play sections">
    {#each TABS as t (t.id)}
      <button class="ui-tab" role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class="tab-body">
    {#if tab === 'controls'}
      <p class="lead">Aiming and firing are automatic. You only decide where to stand.</p>

      {#if isTouch}
        <!-- Shown, not described: the stick spawning under a finger and the
             ship trailing it is the entire control scheme in one loop. -->
        <div class="demo-frame">
          <TutorialDemo game="move" />
        </div>
        <div class="row">
          <span class="row-key">Drag anywhere</span>
          <span class="row-val">Move. A stick appears under your thumb.</span>
        </div>
        <div class="row">
          <span class="row-key">⚡ button</span>
          <span class="row-val">Fire Overclock once the meter is full.</span>
        </div>
        <div class="row">
          <span class="row-key">Jack in</span>
          <span class="row-val">Breach a data node you're standing at.</span>
        </div>
        <div class="row">
          <span class="row-key">❚❚ top right</span>
          <span class="row-val">Pause the run.</span>
        </div>
        <p class="note">
          Left-handed? Settings → Controls moves the ability button to the other side.
        </p>
      {:else}
        <div class="row">
          <span class="row-key"
            ><kbd class="kbd">W</kbd><kbd class="kbd">A</kbd><kbd class="kbd">S</kbd><kbd
              class="kbd">D</kbd
            ></span
          >
          <span class="row-val">Move — arrow keys work too.</span>
        </div>
        <div class="row">
          <span class="row-key"><kbd class="kbd">SPACE</kbd></span>
          <span class="row-val">Fire Overclock once the meter is full.</span>
        </div>
        <div class="row">
          <span class="row-key"><kbd class="kbd">E</kbd></span>
          <span class="row-val">Jack into a data node you're standing at.</span>
        </div>
        <div class="row">
          <span class="row-key"><kbd class="kbd">Q</kbd></span>
          <span class="row-val">Jack in overclocked — harder hack, double loot.</span>
        </div>
        <div class="row">
          <span class="row-key"><kbd class="kbd">1</kbd>–<kbd class="kbd">3</kbd></span>
          <span class="row-val">Quick-pick an upgrade at level-up.</span>
        </div>
        <div class="row">
          <span class="row-key"><kbd class="kbd">ESC</kbd></span>
          <span class="row-val">Pause and resume.</span>
        </div>
      {/if}
    {:else if tab === 'loop'}
      <ol class="steps">
        <li>
          <strong>Kite the horde.</strong> Enemies chase you and damage you on contact. Circle, never
          get surrounded.
        </li>
        <li>
          <strong>Collect shards.</strong> Everything you kill drops XP. Walk over it — the gold bar
          across the top of the screen is your progress to the next level.
        </li>
        <li>
          <strong>Pick an upgrade.</strong> Every level offers three. New weapons early, levels into
          what's working later.
        </li>
        <li>
          <strong>Open chests.</strong> Elites drop caches full of upgrades — and late-game chests can
          evolve a maxed weapon into its final form.
        </li>
        <li>
          <strong>Survive to 10:00.</strong> A Firewall boss wakes at 8:00. Kill it to win, or stay in
          Endless and chase a score.
        </li>
      </ol>
    {:else}
      <div class="sys">
        <h3 class="sys-title"><span aria-hidden="true">⚡</span> Overclock</h3>
        <p class="sys-body">
          The meter under your health fills as you fight. When it's full, trigger it for a short
          window of overwhelming firepower. Each fighter's Overclock behaves differently.
        </p>
      </div>
      <div class="sys">
        <h3 class="sys-title"><span aria-hidden="true">🔓</span> Breaching</h3>
        <p class="sys-body">
          Data nodes sit around the arena. Stand at one and jack in to play a short hack for gear.
          Security rating sets both the difficulty and the payout; overclocking a breach doubles the
          reward and tightens the clock. There are four hacks — each one plays like this:
        </p>
        <!-- All four mechanics, playable-looking, before you ever meet one.
             A player who reads this once is never surprised mid-run. -->
        <div class="hack-grid">
          {#each [{ id: 'crack', name: 'Crack Timer' }, { id: 'cascade', name: 'Code Cascade' }, { id: 'route', name: 'Circuit Route' }, { id: 'runner', name: 'Grid Runner' }] as h (h.id)}
            <figure class="hack">
              <TutorialDemo game={h.id as 'crack' | 'cascade' | 'route' | 'runner'} />
              <figcaption>{h.name}</figcaption>
            </figure>
          {/each}
        </div>
      </div>
      <div class="sys">
        <h3 class="sys-title"><span aria-hidden="true">💀</span> Exploits</h3>
        <p class="sys-body">
          Won from breaches. Unlike upgrades, an exploit changes a rule of the run instead of a
          number. You can carry three at a time.
        </p>
      </div>
      <div class="sys">
        <h3 class="sys-title"><span aria-hidden="true">📖</span> Evolutions</h3>
        <p class="sys-body">
          Max a weapon, hold its partner passive, then open a chest — the pair fuses into a far
          stronger weapon. The Evolutions screen lists every recipe.
        </p>
      </div>
      <div class="sys">
        <h3 class="sys-title"><span aria-hidden="true">☠️</span> Threat level</h3>
        <p class="sys-body">
          Set before a run. Higher means tougher enemies but far more XP and credits. Credits buy
          permanent upgrades that carry into every future run.
        </p>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <button class="ui-btn primary" onclick={close}>Got it</button>
  {/snippet}
</Modal>

<style>
  .tab-body {
    margin-top: var(--sp-4);
    min-height: 16rem;
  }

  .lead {
    margin: 0 0 0.9rem;
    padding: 0.6rem 0.75rem;
    border-radius: var(--r-sm);
    background: rgba(54, 230, 255, 0.08);
    border: 1px solid rgba(54, 230, 255, 0.25);
    font-size: var(--fs-label);
    font-weight: 600;
    line-height: 1.45;
    color: var(--color-primary);
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 0.85rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .row:last-of-type {
    border-bottom: none;
  }
  .row-key {
    flex: 0 0 8.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    font-size: var(--fs-caption);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .row-val {
    flex: 1;
    font-size: var(--fs-caption);
    line-height: 1.45;
    color: var(--color-text-dim);
  }
  .note {
    margin: 0.9rem 0 0;
    font-size: var(--fs-micro);
    line-height: 1.5;
    color: var(--color-text-faint);
  }

  .steps {
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .steps li {
    font-size: var(--fs-caption);
    line-height: 1.55;
    color: var(--color-text-dim);
  }
  .steps li::marker {
    color: var(--color-primary);
    font-weight: 700;
  }
  .steps strong {
    color: var(--color-text-main);
  }

  .sys {
    padding: 0.7rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .sys:last-child {
    border-bottom: none;
  }
  .sys-title {
    margin: 0 0 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--fs-label);
    font-weight: 800;
    color: var(--color-text-main);
  }
  .sys-body {
    margin: 0;
    font-size: var(--fs-caption);
    line-height: 1.55;
    color: var(--color-text-dim);
  }

  /* Controls demo frame */
  .demo-frame {
    display: flex;
    justify-content: center;
    padding: 0.5rem 0 0.9rem;
    --bcolor: var(--color-primary);
  }

  /* Four hack demos, side by side */
  .hack-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
    margin-top: 0.75rem;
    --bcolor: var(--color-primary);
  }
  .hack {
    margin: 0;
    padding: 0.5rem 0.4rem 0.4rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }
  .hack :global(.stage) {
    max-width: 6.5rem;
  }
  .hack figcaption {
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    text-align: center;
  }

  @media (min-width: 641px) {
    .hack-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @media (max-width: 400px) {
    .row {
      flex-direction: column;
      gap: 0.25rem;
    }
    .row-key {
      flex: none;
    }
  }
</style>
