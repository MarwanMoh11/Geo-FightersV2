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
  <div class="loadout glass">
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

  .loadout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 9px;
    border-radius: var(--r-lg);
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
    width: 40px;
    height: 40px;
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

  .art {
    position: absolute;
    inset: 0;
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }
  .weapon .art {
    box-shadow: inset 0 0 0 1px rgba(54, 230, 255, 0.4);
  }
  .passive .art {
    box-shadow: inset 0 0 0 1px rgba(56, 245, 168, 0.4);
  }

  .art :global(svg) {
    width: 23px;
    height: 23px;
  }
  .icon-img {
    width: 76%;
    height: 76%;
    object-fit: contain;
  }
  .icon-emoji {
    font-size: 1.2rem;
  }

  .cooldown {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  .lvl {
    position: absolute;
    bottom: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1;
    color: #04060f;
    background: var(--color-text-main);
    border: 1.5px solid var(--color-bg-dark);
    border-radius: var(--r-pill);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .weapon .lvl {
    background: var(--color-primary);
  }
  .passive .lvl {
    background: var(--color-accent);
  }

  /* Phones: smaller slots so a full kit fits in 1–2 tidy rows without ever
     needing to scroll or bleeding off the edges. */
  @media (max-width: 640px) {
    .loadout {
      gap: 5px;
      padding: 6px 7px;
    }
    .slot {
      width: 34px;
      height: 34px;
    }
    .art :global(svg) {
      width: 20px;
      height: 20px;
    }
    .icon-emoji {
      font-size: 1.05rem;
    }
    .lvl {
      min-width: 14px;
      height: 14px;
      font-size: 0.55rem;
    }
  }
</style>
