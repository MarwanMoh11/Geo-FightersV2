<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { WEAPONS } from '../../core/WeaponRegistry';
  import { PASSIVES } from '../../core/PassiveRegistry';
  import { EVOLUTIONS } from '../../core/EvolutionRegistry';
  import { getWeaponIcon, getPassiveIcon } from '../icons';
  import { fade, scale } from 'svelte/transition';

  function close() {
    uiState.showGrimoire = false;
  }
</script>

{#if uiState.showGrimoire}
  <div id="grimoire-modal" transition:fade={{ duration: 180 }}>
    <div class="sheet glass" transition:scale={{ duration: 240, start: 0.95 }}>
      <header class="grimoire-header">
        <h2 class="title">System Evolutions</h2>
        <p class="subtitle">Weapon + Passive Combinations (Grimoire)</p>
      </header>

      <div class="scroll-area">
        <div class="evolutions-grid">
          {#each EVOLUTIONS as evo}
            {@const baseW = WEAPONS[evo.weaponId]}
            {@const passP = PASSIVES[evo.passiveId]}
            {@const evolvedW = WEAPONS[evo.evolvedWeaponId]}
            {#if baseW && passP && evolvedW}
              <div class="recipe-card">
                <div class="recipe-row">
                  <!-- Base Weapon -->
                  <div class="element">
                    <div class="element-icon">
                      {@html getWeaponIcon(evo.weaponId)}
                    </div>
                    <div class="element-name">{baseW.name}</div>
                    <div class="element-tag">WEAPON</div>
                  </div>

                  <span class="operator">+</span>

                  <!-- Required Passive -->
                  <div class="element">
                    <div class="element-icon">
                      {@html getPassiveIcon(evo.passiveId)}
                    </div>
                    <div class="element-name">{passP.name}</div>
                    <div class="element-tag">PASSIVE</div>
                  </div>

                  <span class="operator">=</span>

                  <!-- Evolved Weapon -->
                  <div class="element evolved">
                    <div class="element-icon evolved-glow">
                      {@html getWeaponIcon(evo.evolvedWeaponId)}
                    </div>
                    <div class="element-name evolved-name">{evolvedW.name}</div>
                    <div class="element-tag evolved-tag">EVOLVED</div>
                  </div>
                </div>

                <div class="recipe-desc">
                  {evolvedW.description}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <button class="close-btn" onclick={close}>
        <span class="btn-text">Close Grimoire</span>
      </button>
    </div>
  </div>
{/if}

<style>
  #grimoire-modal {
    position: fixed;
    inset: 0;
    z-index: 2500;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(4, 6, 15, 0.72);
    backdrop-filter: blur(12px);
    padding: 1.5rem;
    pointer-events: auto;
  }

  .sheet {
    width: 100%;
    max-width: 680px;
    max-height: 80vh;
    border-radius: var(--r-xl);
    padding: 2rem 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    text-align: center;
    overflow: hidden;
  }

  .grimoire-header {
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    color: var(--color-text-main);
  }

  .subtitle {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-primary);
    margin-top: 0.5rem;
  }

  .scroll-area {
    flex: 1;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  /* Custom Scrollbar for matrix look */
  .scroll-area::-webkit-scrollbar {
    width: 4px;
  }
  .scroll-area::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
  }
  .scroll-area::-webkit-scrollbar-thumb {
    background: var(--color-border-bright);
    border-radius: 2px;
  }

  .evolutions-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
  }

  .recipe-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--color-border);
    border-radius: var(--r-md);
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    transition: all var(--transition-fast);
  }
  .recipe-card:hover {
    background: rgba(255, 255, 255, 0.035);
    border-color: rgba(0, 229, 255, 0.25);
  }

  .recipe-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .element {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .element-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .element-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .element-name {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--color-text-main);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .element-tag {
    font-family: var(--font-mono);
    font-size: 0.48rem;
    letter-spacing: 0.08em;
    color: var(--color-text-dim);
  }

  .operator {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--color-text-dim);
    user-select: none;
    padding: 0 0.2rem;
  }

  .element.evolved {
    background: rgba(0, 229, 255, 0.04);
    border: 1px dashed rgba(0, 229, 255, 0.25);
    border-radius: var(--r-sm);
    padding: 0.4rem 0.2rem;
  }

  .evolved-glow :global(svg) {
    filter: drop-shadow(0 0 6px var(--color-accent)) !important;
  }

  .evolved-name {
    color: var(--color-accent);
  }

  .evolved-tag {
    color: var(--color-accent);
    font-weight: 700;
  }

  .recipe-desc {
    font-size: 0.72rem;
    color: var(--color-text-dim);
    line-height: 1.4;
    border-top: 1px dashed rgba(255, 255, 255, 0.05);
    padding-top: 0.6rem;
  }

  .close-btn {
    all: unset;
    cursor: pointer;
    padding: 0.9rem;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--color-border-bright);
  }
  .close-btn:active {
    transform: scale(0.985);
  }

  .btn-text {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--color-text-main);
  }

  /* Responsive layout adjustment for smaller phone screens */
  @media (max-width: 480px) {
    .recipe-row {
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.8rem;
    }
    .element {
      flex: unset;
      width: 40%;
    }
    .element.evolved {
      width: 90%;
      margin-top: 0.4rem;
    }
    .operator {
      display: none;
    }
  }
</style>
