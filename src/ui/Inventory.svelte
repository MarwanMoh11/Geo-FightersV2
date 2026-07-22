<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { WEAPONS } from '../core/WeaponRegistry';
  import { PASSIVES } from '../core/PassiveRegistry';
  import { getWeaponIcon, getPassiveIcon } from './icons';

  let weapons = $derived(uiState.weaponSlots);
  let passives = $derived(uiState.passiveSlots);

  function getName(id: string, type: 'weapon' | 'passive') {
    if (type === 'weapon') return WEAPONS[id]?.name || id;
    return PASSIVES[id]?.name || id;
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
  </div>
</div>

<style>
  #inventory-layer {
    position: fixed;
    left: 50%;
    bottom: calc(var(--safe-bottom) + 14px);
    transform: translateX(-50%);
    z-index: 40;
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

  /* Minimal: no panel, no tiles — just the icons floating over the game. */
  .loadout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  /* Full-width flex break: everything after it (passives) starts a fresh row. */
  .row-break {
    flex-basis: 100%;
    height: 0;
    margin: 1px 0;
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

  /* No tile fill, no ring — a drop-shadow keeps the bare icon readable over any
     scene; overflow+radius still clip the cooldown sweep to the icon. */
  .art {
    position: absolute;
    inset: 0;
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.85));
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

  /* Phones: smaller still so a full kit fits in 1–2 tidy rows without ever
     needing to scroll or bleeding off the edges. */
  @media (max-width: 640px) {
    .loadout {
      gap: 3px;
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
    .lvl {
      min-width: 12px;
      height: 12px;
      font-size: 0.48rem;
    }
  }
</style>
