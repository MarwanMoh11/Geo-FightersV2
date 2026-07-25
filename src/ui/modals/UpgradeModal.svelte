<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import {
    selectUpgrade,
    rerollUpgradeChoices,
    banishUpgradeOption,
    type UpgradeOption,
  } from '../../systems/UpgradeSystem';
  import { formatBehaviourTag, getExploitById } from '../../core/ExploitRegistry';
  import { WEAPONS } from '../../core/WeaponRegistry';
  import { PASSIVES } from '../../core/PassiveRegistry';
  import { playUpgradeSelect, playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import Modal from '../Modal.svelte';

  let selectedId: string | null = $state(null);
  let focusIndex = $state(-1); // -1 until the keyboard is used (no phantom highlight on touch)

  // Celebrate the modal opening (mobile buzz) and reset keyboard focus
  $effect(() => {
    if (uiState.showUpgrade) {
      focusIndex = -1;
      haptics.levelUp();
    }
  });

  function handleSelect(option: UpgradeOption) {
    if (selectedId) return; // a pick is already being committed
    selectedId = option.id;
    playUpgradeSelect();
    haptics.select();

    // Let the selection flash play before applying + resuming the game
    setTimeout(() => {
      selectUpgrade(option);
      selectedId = null;
    }, 350);
  }

  function handleBanish(id: string) {
    playMenuClick();
    haptics.select();
    banishUpgradeOption(id);
  }

  // VS-style keyboard support: 1-9 quick-pick, arrows browse, Enter/Space confirm
  function handleKeydown(e: KeyboardEvent) {
    if (!uiState.showUpgrade || selectedId) return;
    const choices = uiState.upgradeChoices;
    if (choices.length === 0) return;

    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= choices.length) {
      e.preventDefault();
      handleSelect(choices[digit - 1]);
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusIndex = (focusIndex + 1) % choices.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusIndex = (focusIndex - 1 + choices.length) % choices.length;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleSelect(choices[focusIndex >= 0 ? focusIndex : 0]);
        break;
    }
  }

  function getRarityColor(rarity: string = 'common') {
    switch (rarity) {
      case 'legendary':
        return 'var(--rarity-legendary)';
      case 'epic':
        return 'var(--rarity-epic)';
      case 'rare':
        return 'var(--rarity-rare)';
      case 'uncommon':
        return 'var(--rarity-uncommon)';
      default:
        return 'var(--rarity-common)';
    }
  }

  // Exploit offers need a behaviour tag or stat breakdown rendered below the
  // description. The upgrade payload only carries the def id (see
  // UpgradeSystem.ts:260-280), so look the def up here — the registry is tiny
  // and lookup is O(N=7).
  function getExploitExtra(option: UpgradeOption): string {
    if (option.type !== 'exploit_new') return '';
    const def = getExploitById(option.id);
    return def ? formatBehaviourTag(def) : '';
  }

  /**
   * Evolution pairing hint — the beginner's biggest blind spot.
   *
   * Nothing at the level-up screen ever said that this particular passive is
   * the one that evolves the weapon you're already carrying, so new players
   * picked by description and never assembled a recipe by accident. The
   * badge names the partner, at the exact moment the choice is made.
   */
  function pairingFor(option: UpgradeOption): string {
    const held = uiState.weaponSlots;
    const heldPassives = new Set(uiState.passiveSlots.map((p) => p.passiveId));

    // Offering a passive that completes a weapon already in the loadout
    if (option.type === 'passive_new' || option.type === 'passive_level') {
      const match = held.find((w) => WEAPONS[w.weaponId]?.evolutionRequires === option.id);
      if (match) return `Evolves ${WEAPONS[match.weaponId]?.name ?? match.weaponId}`;
      return '';
    }

    // Offering a weapon whose partner passive is already held
    if (option.type === 'weapon_new' || option.type === 'weapon_level') {
      const req = WEAPONS[option.id]?.evolutionRequires;
      if (req && heldPassives.has(req)) {
        return `Pairs with ${PASSIVES[req]?.name ?? req}`;
      }
    }
    return '';
  }

  /* Colour the whole sheet by the best thing on offer, so a legendary drop
     announces itself before a single word is read. */
  const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  let bestRarity = $derived(
    uiState.upgradeChoices.reduce(
      (best, o) =>
        RANK.indexOf(o.rarity ?? 'common') > RANK.indexOf(best) ? (o.rarity ?? 'common') : best,
      'common',
    ),
  );
  let tone = $derived(
    bestRarity === 'epic' ? 'pink' : bestRarity === 'legendary' ? 'gold' : 'cyan',
  ) as 'cyan' | 'pink' | 'gold';
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Not dismissible: a level-up must resolve into a pick before the run
     resumes, so there is deliberately no ✕ and no backdrop escape. -->
<Modal
  open={uiState.showUpgrade}
  eyebrow="Level {uiState.level}"
  title="Choose an upgrade"
  size="lg"
  {tone}
  dismissible={false}
>
  <div class="cards" class:few={uiState.upgradeChoices.length <= 2}>
    {#each uiState.upgradeChoices as option, i (option.id)}
      {@const color = getRarityColor(option.rarity)}
      {@const isExploit = option.type === 'exploit_new'}
      {@const exploitExtra = isExploit ? getExploitExtra(option) : ''}
      {@const canBanish = uiState.runBanishes > 0 && option.type !== 'health'}
      {@const pairing = pairingFor(option)}
      <div class="card-wrap" style="--rarity-color: {color}; animation-delay: {i * 80}ms">
        <button
          class="card"
          class:exploit-card={isExploit}
          class:selected={selectedId === option.id}
          class:dimmed={selectedId !== null && selectedId !== option.id}
          class:key-focused={focusIndex === i && !selectedId}
          onclick={() => handleSelect(option)}
          onmouseenter={() => (focusIndex = i)}
        >
          <span class="hotkey pointer-only" aria-hidden="true">{i + 1}</span>
          <span class="rarity-tag">{option.rarity || 'common'}</span>

          <span class="icon" class:exploit-icon={isExploit}>
            {#if option.icon && option.icon.startsWith('<svg')}
              {@html option.icon}
            {:else if option.icon && option.icon.endsWith('.png')}
              <img src={option.icon} alt="" class="icon-img" />
            {:else}
              {option.icon || '📦'}
            {/if}
          </span>

          <span class="info">
            <span class="name">{option.name}</span>
            {#if isExploit}
              <span class="kind-tag">EXPLOIT</span>
            {/if}
            {#if option.nextLevel}
              <span class="level-step tnum">LV {option.currentLevel} → {option.nextLevel}</span>
            {/if}
            <span class="desc">{option.description}</span>
            {#if isExploit && exploitExtra}
              <span class="rule-tag">{exploitExtra}</span>
            {/if}
            {#if pairing}
              <span class="pair-tag"><span aria-hidden="true">⧉</span> {pairing}</span>
            {/if}
          </span>
        </button>

        <!-- Sibling, not a child: a button inside a button is invalid and
             makes the banish tap fight the card tap for the same pixel. -->
        {#if canBanish && !selectedId}
          <button
            class="banish"
            title="Banish {option.name} from this run"
            aria-label="Banish {option.name} from this run"
            onclick={() => handleBanish(option.id)}>🚫</button
          >
        {/if}
      </div>
    {/each}
  </div>

  {#snippet footer()}
    <div class="foot-row">
      {#if uiState.runRerolls > 0}
        <button class="ui-btn reroll" onclick={rerollUpgradeChoices}>
          🔄 Reroll <span class="tnum">×{uiState.runRerolls}</span>
        </button>
      {/if}
      {#if uiState.runBanishes > 0}
        <span class="ui-chip pink">🚫 {uiState.runBanishes} banish</span>
      {/if}
      <span class="hint pointer-only">
        <kbd class="kbd">1</kbd>–<kbd class="kbd">{uiState.upgradeChoices.length}</kbd> pick ·
        <kbd class="kbd">←</kbd><kbd class="kbd">→</kbd> browse
      </span>
      <span class="hint touch-only">Tap a card to take it</span>
    </div>
  {/snippet}
</Modal>

<style>
  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .card-wrap {
    position: relative;
    animation: card-in 0.45s var(--ease-out-expo) both;
  }
  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .card {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.9rem;
    padding: 0.85rem 1rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--rarity-color);
    text-align: left;
    overflow: hidden;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      opacity var(--transition-fast),
      transform var(--transition-fast);
  }
  .card:hover,
  .card.key-focused {
    background: var(--surface-3);
    border-color: var(--rarity-color);
    box-shadow: inset 0 0 0 1px var(--rarity-color);
  }
  .card:active {
    transform: scale(0.99);
  }

  /* Commit animation: chosen card flares, the others fall away */
  .card.selected {
    border-color: var(--rarity-color);
    box-shadow:
      inset 0 0 0 1px var(--rarity-color),
      0 0 30px -10px var(--rarity-color);
    animation: selected-flash 0.35s ease-out both;
  }
  .card.dimmed {
    opacity: 0.28;
    filter: grayscale(0.7);
  }
  @keyframes selected-flash {
    0% {
      background: rgba(255, 255, 255, 0.28);
    }
    100% {
      background: var(--surface-3);
    }
  }

  .hotkey {
    position: absolute;
    left: 0.55rem;
    top: 0.5rem;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--color-text-faint);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .rarity-tag {
    position: absolute;
    top: 0.55rem;
    right: 0.7rem;
    font-family: var(--font-mono);
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--rarity-color);
  }

  .icon {
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.85rem;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--rarity-color) 12%, transparent);
  }
  .icon :global(svg) {
    width: 34px;
    height: 34px;
  }
  .icon-img {
    width: 84%;
    height: 84%;
    object-fit: contain;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    min-width: 0;
    /* Keep text clear of the absolutely-placed rarity tag */
    padding-right: 3.6rem;
  }
  .name {
    font-size: var(--fs-heading);
    font-weight: 700;
    line-height: 1.2;
    color: var(--color-text-main);
  }
  .level-step {
    font-size: var(--fs-micro);
    letter-spacing: 0.1em;
    color: var(--rarity-color);
  }
  .desc {
    font-size: var(--fs-caption);
    line-height: 1.4;
    color: var(--color-text-dim);
  }

  .kind-tag {
    align-self: flex-start;
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-secondary);
    background: rgba(255, 61, 119, 0.12);
    border: 1px solid rgba(255, 61, 119, 0.3);
    border-radius: 3px;
    padding: 1px 5px;
    margin-bottom: 0.1rem;
  }
  /* Gold, like every other evolution cue in the game (loadout marks, the
     Grimoire "both held" flag) so the association is learned once. */
  .pair-tag {
    align-self: flex-start;
    margin-top: 0.35rem;
    padding: 0.1rem 0.4rem;
    border-radius: var(--r-pill);
    background: rgba(255, 216, 77, 0.14);
    border: 1px solid rgba(255, 216, 77, 0.45);
    font-family: var(--font-mono);
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--color-gold);
  }

  .rule-tag {
    margin-top: 0.3rem;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--color-secondary);
    text-transform: uppercase;
  }

  .card.exploit-card {
    background: linear-gradient(
      135deg,
      rgba(255, 61, 119, 0.09) 0%,
      rgba(176, 107, 255, 0.05) 100%
    );
    border-left-color: var(--color-secondary);
  }
  .exploit-icon {
    background: rgba(255, 61, 119, 0.15) !important;
    border: 1px solid rgba(255, 61, 119, 0.3);
  }

  /* Banish: a small, deliberate target in the corner, clear of the card's
     own tap area. */
  /* Deliberately quiet: banishing is a rare, considered action, and three
     loud pink buttons competed with the three cards they sit on. */
  .banish {
    all: unset;
    position: absolute;
    right: 0.35rem;
    bottom: 0.35rem;
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    border-radius: var(--r-sm);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    opacity: 0.4;
    filter: grayscale(0.6);
    transition:
      opacity var(--transition-fast),
      filter var(--transition-fast),
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .banish:hover,
  .banish:focus-visible {
    opacity: 1;
    filter: none;
    background: rgba(255, 61, 119, 0.18);
    border-color: rgba(255, 61, 119, 0.45);
  }

  /* ---- Footer ---- */
  .foot-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    flex-wrap: wrap;
  }
  .ui-btn.reroll {
    flex: 0 0 auto;
    background: rgba(54, 230, 255, 0.1);
    border-color: rgba(54, 230, 255, 0.3);
    color: var(--color-primary);
  }
  .ui-btn.reroll:hover {
    background: rgba(54, 230, 255, 0.2);
  }
  .hint {
    margin-left: auto;
    font-size: var(--fs-micro);
    letter-spacing: 0.06em;
    color: var(--color-text-faint);
  }

  /* Desktop: choices side by side so the whole offer is one glance */
  @media (min-width: 780px) {
    .cards {
      flex-direction: row;
      align-items: stretch;
    }
    .card-wrap {
      flex: 1;
      min-width: 0;
      display: flex;
    }
    .card {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.7rem;
      padding: 1.25rem 1.1rem 1.4rem;
    }
    .icon {
      width: 54px;
      height: 54px;
      font-size: 2.1rem;
    }
    .info {
      padding-right: 0;
    }
    /* Leave room in the body for the banish control, which lives in the
       bottom-right corner — the rarity tag stays pinned top-right so the two
       never sit on top of each other. */
    .card {
      padding-bottom: 2.6rem;
    }
  }
</style>
