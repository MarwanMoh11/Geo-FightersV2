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
  <div class="inventory-container">
    <!-- Weapons Section -->
    <div class="inv-group weapons">
      <div class="group-label">OFFENSIVE MODULES</div>
      <div class="slots">
        {#each weapons as slot, i}
          {@const icon = getWeaponIcon(slot.weaponId)}
          {@const name = getName(slot.weaponId, 'weapon')}
          {@const readiness = uiState.weaponReadiness[i] ?? 1}
          <div class="slot weapon glass active" title={name}>
            {#if icon.endsWith('.png')}
              <img src={icon} alt={name} class="item-icon-img" />
            {:else}
              <div class="item-icon">{icon}</div>
            {/if}
            <!-- Cooldown sweep: dark overlay drains away as the weapon recharges -->
            {#if readiness < 0.95}
              <div class="cooldown-overlay" style="height: {(1 - readiness) * 100}%"></div>
            {/if}
            <div class="level-badge">{slot.level}</div>
          </div>
        {/each}
        {#each Array(6 - weapons.length) as _}
          <div class="slot weapon empty glass"></div>
        {/each}
      </div>
    </div>

    <!-- Passives Section -->
    <div class="inv-group passives">
      <div class="group-label">ENHANCEMENT NODES</div>
      <div class="slots">
        {#each passives as slot}
          {@const icon = getPassiveIcon(slot.passiveId)}
          {@const name = getName(slot.passiveId, 'passive')}
          <div class="slot passive glass active" title={name}>
            {#if icon.endsWith('.png')}
              <img src={icon} alt={name} class="item-icon-img" />
            {:else}
              <div class="item-icon">{icon}</div>
            {/if}
            <div class="level-badge">{slot.level}</div>
          </div>
        {/each}
        {#each Array(6 - passives.length) as _}
          <div class="slot passive empty glass"></div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  #inventory-layer {
    position: fixed;
    top: 5rem;
    left: 1.5rem;
    z-index: 40;
    pointer-events: none;
    font-family: var(--font-mono);
  }

  .hidden {
    display: none !important;
  }

  .inventory-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .inv-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .group-label {
    font-size: 0.5rem;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
    text-transform: uppercase;
  }

  .slots {
    display: flex;
    gap: 0.5rem;
  }

  .slot {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    transition: all var(--transition-smooth);
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }

  .slot.active {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    pointer-events: auto; /* Enable tooltips */
    animation: slot-pop var(--transition-springy) both;
  }

  @keyframes slot-pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .slot.empty {
    opacity: 0.3;
    border: 1px dashed rgba(255, 255, 255, 0.1);
  }

  .cooldown-overlay {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  .item-icon {
    font-size: 1.5rem;
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
  }

  .item-icon-img {
    width: 80%;
    height: 80%;
    object-fit: contain;
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.3));
  }

  .level-badge {
    position: absolute;
    bottom: 2px;
    right: 2px;
    background: var(--color-secondary);
    color: white;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 2px 4px;
    border-radius: 4px;
    line-height: 1;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .weapon.active {
    border-color: var(--color-primary);
    box-shadow: inset 0 0 10px rgba(0, 229, 255, 0.1);
  }

  .passive.active {
    border-color: var(--color-accent);
    box-shadow: inset 0 0 10px rgba(0, 255, 136, 0.1);
  }

  /* Mobile Adjustments */
  @media (max-width: 600px) {
    #inventory-layer {
      top: auto;
      bottom: 2rem;
      left: 1rem;
      right: 1rem;
    }

    .slots {
      gap: 0.25rem;
    }

    .slot {
      width: 36px;
      height: 36px;
    }

    .item-icon {
      font-size: 1.25rem;
    }

    .inv-group {
      gap: 0.25rem;
    }
  }
</style>
