<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { WEAPONS } from '../core/WeaponRegistry';
  import { PASSIVES } from '../core/PassiveRegistry';
  import { EVOLUTION_TIME_THRESHOLD } from '../core/EvolutionRegistry';
  import { formatBehaviourTag, type ExploitDef } from '../core/ExploitRegistry';
  import { getWeaponIcon, getPassiveIcon } from './icons';

  let weapons = $derived(uiState.weaponSlots);
  let passives = $derived(uiState.passiveSlots);
  // 3 fixed slots (null = empty) so the player can always see the limit and
  // which slots are open, not just the ones currently filled.
  let exploitSlots = $derived<(ExploitDef | null)[]>(
    Array.from({ length: 3 }, (_, i) => uiState.exploitSlots?.[i] ?? null),
  );

  function getName(id: string, type: 'weapon' | 'passive') {
    if (type === 'weapon') return WEAPONS[id]?.name || id;
    return PASSIVES[id]?.name || id;
  }

  function getRarityColor(rarity: 'rare' | 'epic' | undefined): string {
    if (rarity === 'epic') return 'var(--color-secondary)';
    if (rarity === 'rare') return 'var(--color-primary)';
    return 'var(--color-text-dim)';
  }

  /**
   * Evolution coaching, read straight off the live loadout.
   *
   * Evolving is the single highest-impact thing a new player can do and it
   * was completely invisible in-run: the recipe table lives behind two menus,
   * so unless you went looking you never learned that a maxed weapon plus a
   * specific passive turns into something far stronger. The bar now says it
   * out loud, for the weapons you actually hold.
   *
   * Each weapon that has an evolution path gets one of three states:
   *   ready   — maxed, partner held, clock past the gate → open a chest
   *   partner — maxed (or close) but the partner passive is missing
   *   path    — has a recipe, still levelling
   */
  type EvoState = 'ready' | 'partner' | 'path' | null;

  let heldPassives = $derived(new Set(passives.map((p) => p.passiveId)));

  function evoFor(weaponId: string, level: number) {
    const def = WEAPONS[weaponId];
    if (!def?.evolvesInto || !def.evolutionRequires) return null;
    const maxed = level >= (def.maxLevel ?? 8);
    const hasPartner = heldPassives.has(def.evolutionRequires);
    const timeOk = uiState.gameTime >= EVOLUTION_TIME_THRESHOLD;
    const state: EvoState = maxed && hasPartner && timeOk ? 'ready' : maxed ? 'partner' : 'path';
    return {
      state,
      partnerId: def.evolutionRequires,
      partnerName: PASSIVES[def.evolutionRequires]?.name ?? def.evolutionRequires,
      evolvedName: WEAPONS[def.evolvesInto]?.name ?? def.evolvesInto,
      hasPartner,
      maxed,
    };
  }

  /* The single most actionable pairing, surfaced as a one-line banner above
     the bar. Only one at a time — a list of recipes mid-fight is noise. */
  let evoHint = $derived.by(() => {
    let best: { text: string; kind: 'ready' | 'need'; icon: string } | null = null;
    for (const slot of weapons) {
      const e = evoFor(slot.weaponId, slot.level);
      if (!e) continue;
      if (e.state === 'ready') {
        return {
          kind: 'ready' as const,
          icon: getWeaponIcon(slot.weaponId),
          text: `${getName(slot.weaponId, 'weapon')} can evolve — open a chest`,
        };
      }
      if (e.state === 'partner' && !best) {
        best = {
          kind: 'need' as const,
          icon: getWeaponIcon(slot.weaponId),
          text: `${getName(slot.weaponId, 'weapon')} is maxed — add ${e.partnerName} to evolve`,
        };
      }
    }
    return best;
  });
</script>

<div id="inventory-layer" class:hidden={uiState.gameState !== 'PLAYING'}>
  {#if evoHint}
    <div class="evo-hint" class:ready={evoHint.kind === 'ready'}>
      <span class="evo-icon">
        {#if evoHint.icon.startsWith('<svg')}
          {@html evoHint.icon}
        {:else}
          {evoHint.icon}
        {/if}
      </span>
      <span class="evo-text">{evoHint.text}</span>
    </div>
  {/if}

  <div class="loadout">
    {#each weapons as slot, i (slot.weaponId)}
      {@const icon = getWeaponIcon(slot.weaponId)}
      {@const name = getName(slot.weaponId, 'weapon')}
      {@const readiness = uiState.weaponReadiness[i] ?? 1}
      {@const evo = evoFor(slot.weaponId, slot.level)}
      {@const maxed = slot.level >= (WEAPONS[slot.weaponId]?.maxLevel ?? 8)}
      <div
        class="slot weapon"
        class:maxed
        class:evo-ready={evo?.state === 'ready'}
        title={evo
          ? `${name} — evolves with ${evo.partnerName} → ${evo.evolvedName}`
          : name}
      >
        <div class="art">
          {#if icon.startsWith('<svg')}
            {@html icon}
          {:else if icon.endsWith('.png')}
            <img src={icon} alt={name} class="icon-img" />
          {:else}
            <div class="icon-emoji">{icon}</div>
          {/if}
          {#if readiness < 0.95}
            <div class="cooldown" style="height: {(1 - readiness) * 100}%"></div>
          {/if}
        </div>
        <span class="lvl tnum" class:max={maxed}>{maxed ? 'M' : slot.level}</span>
        <!-- Corner mark: this weapon has somewhere to go -->
        {#if evo?.state === 'ready'}
          <span class="evo-mark ready" aria-label="Ready to evolve">★</span>
        {:else if evo?.state === 'partner'}
          <span class="evo-mark need" aria-label="Needs partner passive">◈</span>
        {/if}
      </div>
    {/each}

    {#if passives.length > 0 && weapons.length > 0}
      <!-- Force passives onto their own row(s) so the two groups never tangle
           when the bar wraps on a narrow screen. -->
      <div class="row-break"></div>
    {/if}

    {#each passives as slot (slot.passiveId)}
      {@const icon = getPassiveIcon(slot.passiveId)}
      {@const name = getName(slot.passiveId, 'passive')}
      {@const isPartner = weapons.some(
        (w) => WEAPONS[w.weaponId]?.evolutionRequires === slot.passiveId,
      )}
      <div class="slot passive" class:partner={isPartner} title={name}>
        <div class="art">
          {#if icon.startsWith('<svg')}
            {@html icon}
          {:else if icon.endsWith('.png')}
            <img src={icon} alt={name} class="icon-img" />
          {:else}
            <div class="icon-emoji">{icon}</div>
          {/if}
        </div>
        <span class="lvl tnum">{slot.level}</span>
      </div>
    {/each}

    {#if exploitSlots.length > 0}
      <div class="row-break"></div>
      <div class="group-label">EXPLOITS</div>
    {/if}

    {#each exploitSlots as def, i (i)}
      {@const tag = def ? formatBehaviourTag(def) : ''}
      {@const color = def ? getRarityColor(def.rarity) : 'var(--color-text-dim)'}
      <div
        class="slot exploit"
        class:empty={!def}
        title={def ? (tag ? `${def.name} — ${tag}` : def.name) : 'Empty exploit slot'}
        style="--rarity-color: {color};"
      >
        <div class="art">
          {#if def}
            <div class="icon-emoji">{def.icon}</div>
          {:else}
            <div class="empty-mark">—</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  #inventory-layer {
    position: fixed;
    left: 50%;
    bottom: calc(var(--safe-bottom) + 14px);
    transform: translateX(-50%);
    z-index: var(--z-inventory);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    /* max-content keeps each group (weapons / passives) on a single row until it
       genuinely can't fit, then wraps; the max-width caps it to the screen and,
       anchored at the bottom, extra rows grow UPWARD into the frame rather than
       ever running off the sides. */
    width: max-content;
    max-width: min(96vw, 640px);
  }

  .hidden {
    display: none !important;
  }

  /* ---- Evolution coaching banner ---- */
  .evo-hint {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 100%;
    padding: 0.25rem 0.6rem;
    border-radius: var(--r-pill);
    background: rgba(8, 13, 23, 0.86);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 216, 77, 0.4);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--color-gold);
    white-space: nowrap;
    overflow: hidden;
  }
  /* Ready to evolve is a *now* moment — it earns green and a pulse. */
  .evo-hint.ready {
    border-color: rgba(56, 245, 168, 0.55);
    color: var(--color-accent);
    box-shadow: 0 0 18px -6px rgba(56, 245, 168, 0.9);
    animation: evo-throb 1.5s ease-in-out infinite;
  }
  @keyframes evo-throb {
    50% {
      box-shadow: 0 0 26px -4px rgba(56, 245, 168, 1);
    }
  }
  .evo-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    font-size: 0.8rem;
  }
  .evo-icon :global(svg) {
    width: 13px;
    height: 13px;
  }
  .evo-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Minimal: subtle per-icon tiles, no heavy panel. Row-gap is near-zero so the
     weapons row and the items row read as one tight block. */
  .loadout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 1px 4px; /* row-gap column-gap */
  }

  /* Full-width flex break: everything after it (passives) starts a fresh row. */
  .row-break {
    flex-basis: 100%;
    height: 0;
    margin: 0;
  }

  /* Slot is the positioning context; only the art is clipped so the
     level badge can sit on top without being cut off. */
  .slot {
    position: relative;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    animation: slot-pop var(--transition-springy) both;
  }
  @keyframes slot-pop {
    from {
      transform: scale(0.5);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Subtle tile: a soft type-tinted fill (not the old glass panel) that frames
     the icon and keeps it readable; overflow+radius clip the cooldown sweep. */
  .art {
    position: absolute;
    inset: 0;
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
  .weapon .art {
    background: rgba(54, 230, 255, 0.1);
  }
  .passive .art {
    background: rgba(56, 245, 168, 0.1);
  }
  /* A passive that completes a recipe you're holding gets a quiet gold edge,
     so the pairing is visible in the bar itself, not just the banner. */
  .passive.partner .art {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.4),
      inset 0 0 0 1px rgba(255, 216, 77, 0.65);
  }
  .weapon.maxed .art {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.4),
      inset 0 0 0 1px rgba(255, 216, 77, 0.6);
  }
  .weapon.evo-ready .art {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.4),
      inset 0 0 0 1px var(--color-accent),
      0 0 14px -3px var(--color-accent);
  }
  .exploit .art {
    background: rgba(255, 61, 119, 0.12);
    border: 1px solid var(--rarity-color, rgba(255, 61, 119, 0.35));
  }
  /* Empty placeholder: drop the tinted fill, switch to a dashed dim border so
     the gap reads as "open" instead of "missing". */
  .exploit.empty .art {
    background: transparent;
    border-style: dashed;
    border-color: var(--color-text-dim);
    opacity: 0.6;
  }
  .empty-mark {
    font-size: 1.1rem;
    font-weight: 300;
    line-height: 1;
    color: var(--color-text-dim);
  }

  .art :global(svg) {
    width: 22px;
    height: 22px;
  }
  .icon-img {
    width: 82%;
    height: 82%;
    object-fit: contain;
  }
  .icon-emoji {
    font-size: 1.1rem;
  }

  .cooldown {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  /* Tiny level pill — the only mark left; kept legible but unobtrusive. */
  .lvl {
    position: absolute;
    bottom: -2px;
    right: -2px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.52rem;
    font-weight: 800;
    line-height: 1;
    color: #04060f;
    background: var(--color-text-main);
    border-radius: var(--r-pill);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }
  .weapon .lvl {
    background: var(--color-primary);
  }
  .passive .lvl {
    background: var(--color-accent);
  }
  /* "M" instead of 8 — max is a state worth naming, not a number to compare */
  .lvl.max {
    background: var(--color-gold);
  }

  /* Corner mark: where this weapon can still go */
  .evo-mark {
    position: absolute;
    top: -3px;
    left: -3px;
    width: 13px;
    height: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.5rem;
    line-height: 1;
    border-radius: 50%;
    color: #04060f;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }
  .evo-mark.ready {
    background: var(--color-accent);
    animation: evo-throb 1.5s ease-in-out infinite;
  }
  .evo-mark.need {
    background: var(--color-gold);
  }

  /* Inline label that sits between rows (EXPLOITS heading). The pill style
     keeps it aligned to the slot bar's vertical centre without competing
     with the icon tiles for visual weight. */
  .group-label {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-secondary);
    padding: 0 0.4rem;
    align-self: center;
    height: 18px;
    line-height: 18px;
    border-left: 1px solid rgba(255, 61, 119, 0.35);
  }

  /* Phones: smaller still so a full kit fits in 1–2 tidy rows without ever
     needing to scroll or bleeding off the edges. */
  @media (max-width: 640px) {
    .loadout {
      gap: 1px 3px;
    }
    .slot {
      width: 30px;
      height: 30px;
    }
    .art :global(svg) {
      width: 19px;
      height: 19px;
    }
    .icon-emoji {
      font-size: 0.95rem;
    }
    .empty-mark {
      font-size: 0.95rem;
    }
    .lvl {
      min-width: 12px;
      height: 12px;
      font-size: 0.48rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .evo-hint.ready,
    .evo-mark.ready {
      animation: none;
    }
  }
</style>
