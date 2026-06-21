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
        <span class="lvl tnum">{slot.level}</span>
      </div>
    {/each}

    {#if passives.length > 0 && weapons.length > 0}
      <div class="divider"></div>
    {/if}

    {#each passives as slot}
      {@const icon = getPassiveIcon(slot.passiveId)}
      {@const name = getName(slot.passiveId, 'passive')}
      <div class="slot passive" title={name}>
        {#if icon.startsWith('<svg')}
          {@html icon}
        {:else if icon.endsWith('.png')}
          <img src={icon} alt={name} class="icon-img" />
        {:else}
          <div class="icon-emoji">{icon}</div>
        {/if}
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
    max-width: calc(100vw - 32px);
  }

  .hidden {
    display: none !important;
  }

  .loadout {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px;
    border-radius: var(--r-pill);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .loadout::-webkit-scrollbar {
    display: none;
  }

  .divider {
    width: 1px;
    align-self: stretch;
    margin: 4px 2px;
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .slot {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: var(--r-pill);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.03);
    overflow: hidden;
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
  .slot.weapon {
    box-shadow: inset 0 0 0 1px rgba(54, 230, 255, 0.35);
  }
  .slot.passive {
    box-shadow: inset 0 0 0 1px rgba(56, 245, 168, 0.35);
  }

  .slot :global(svg) {
    width: 22px;
    height: 22px;
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
    bottom: -1px;
    right: -1px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.52rem;
    font-weight: 700;
    line-height: 1;
    color: #04060f;
    background: var(--color-text-main);
    border-radius: var(--r-pill);
  }
  .weapon .lvl {
    background: var(--color-primary);
  }
  .passive .lvl {
    background: var(--color-accent);
  }
</style>
