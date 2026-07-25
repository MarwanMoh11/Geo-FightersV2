<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { WEAPONS } from '../core/WeaponRegistry';
  import { PASSIVES } from '../core/PassiveRegistry';
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
</script>

<div id="inventory-layer" class:hidden={uiState.gameState !== 'PLAYING'}>
  <div class="loadout">
    {#each weapons as slot, i}
      {@const icon = getWeaponIcon(slot.weaponId)}
      {@const name = getName(slot.weaponId, 'weapon')}
      {@const readiness = uiState.weaponReadiness[i] ?? 1}
      <div class="slot weapon" title={name}>
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
        <span class="lvl tnum">{slot.level}</span>
      </div>
    {/each}

    {#if passives.length > 0 && weapons.length > 0}
      <!-- Force passives onto their own row(s) so the two groups never tangle
           when the bar wraps on a narrow screen. -->
      <div class="row-break"></div>
    {/if}

    {#each passives as slot}
      {@const icon = getPassiveIcon(slot.passiveId)}
      {@const name = getName(slot.passiveId, 'passive')}
      <div class="slot passive" title={name}>
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

    {#each exploitSlots as def}
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
</style>
