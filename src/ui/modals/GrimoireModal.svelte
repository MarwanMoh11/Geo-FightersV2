<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { WEAPONS } from '../../core/WeaponRegistry';
  import { PASSIVES } from '../../core/PassiveRegistry';
  import { EVOLUTIONS } from '../../core/EvolutionRegistry';
  import { getWeaponIcon, getPassiveIcon } from '../icons';
  import { playMenuClick } from '../../core/audio';
  import Modal from '../Modal.svelte';

  function close() {
    playMenuClick();
    uiState.showGrimoire = false;
  }

  /* Mid-run this doubles as a build planner: a recipe you already hold both
     halves of is called out, so you can see what's one level-up away instead
     of memorising the table. */
  let ownedWeapons = $derived(new Set(uiState.weaponSlots.map((s) => s.weaponId)));
  let ownedPassives = $derived(new Set(uiState.passiveSlots.map((s) => s.passiveId)));
  let inRun = $derived(uiState.gameState === 'PLAYING' || uiState.gameState === 'PAUSED');
</script>

<Modal
  open={uiState.showGrimoire}
  eyebrow="Grimoire"
  title="Evolutions"
  subtitle="Max a weapon, hold its partner passive, then open a chest to evolve it."
  size="lg"
  tone="pink"
  backdropClose
  onclose={close}
>
  <div class="evolutions">
    {#each EVOLUTIONS as evo (evo.evolvedWeaponId)}
      {@const baseW = WEAPONS[evo.weaponId]}
      {@const passP = PASSIVES[evo.passiveId]}
      {@const evolvedW = WEAPONS[evo.evolvedWeaponId]}
      {#if baseW && passP && evolvedW}
        {@const hasW = ownedWeapons.has(evo.weaponId)}
        {@const hasP = ownedPassives.has(evo.passiveId)}
        {@const ready = inRun && hasW && hasP}
        <div class="recipe" class:ready>
          {#if ready}
            <span class="ready-flag">Both held</span>
          {/if}
          <div class="recipe-row">
            <div class="element" class:have={inRun && hasW}>
              <div class="element-icon">{@html getWeaponIcon(evo.weaponId)}</div>
              <div class="element-name">{baseW.name}</div>
              <div class="element-tag">Weapon</div>
            </div>

            <span class="operator" aria-hidden="true">+</span>

            <div class="element" class:have={inRun && hasP}>
              <div class="element-icon">{@html getPassiveIcon(evo.passiveId)}</div>
              <div class="element-name">{passP.name}</div>
              <div class="element-tag">Passive</div>
            </div>

            <span class="operator" aria-hidden="true">=</span>

            <div class="element evolved">
              <div class="element-icon evolved-glow">{@html getWeaponIcon(evo.evolvedWeaponId)}</div>
              <div class="element-name evolved-name">{evolvedW.name}</div>
              <div class="element-tag evolved-tag">Evolved</div>
            </div>
          </div>

          <p class="recipe-desc">{evolvedW.description}</p>
        </div>
      {/if}
    {/each}
  </div>

  {#snippet footer()}
    <button class="ui-btn primary" onclick={close}>Close</button>
  {/snippet}
</Modal>

<style>
  .evolutions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .recipe {
    position: relative;
    padding: 0.9rem 0.85rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
  }
  .recipe.ready {
    border-color: rgba(56, 245, 168, 0.45);
    background: rgba(56, 245, 168, 0.06);
  }
  .ready-flag {
    position: absolute;
    top: -0.55rem;
    right: 0.7rem;
    padding: 0.12rem 0.5rem;
    border-radius: var(--r-pill);
    background: var(--color-accent);
    color: #03150e;
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .recipe-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center;
    gap: 0.35rem;
  }

  .element {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
    text-align: center;
    opacity: 0.9;
  }
  .element.have .element-icon {
    border-color: var(--color-accent);
    box-shadow: 0 0 14px -6px var(--color-accent);
  }

  .element-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border);
  }
  .element-icon :global(svg) {
    width: 26px;
    height: 26px;
  }

  .element-name {
    font-size: var(--fs-micro);
    font-weight: 700;
    line-height: 1.25;
    color: var(--color-text-main);
    overflow-wrap: anywhere;
  }
  .element-tag {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-faint);
  }

  .evolved .element-icon {
    border-color: rgba(255, 61, 119, 0.5);
    background: rgba(255, 61, 119, 0.1);
  }
  .evolved-glow {
    box-shadow: 0 0 18px -6px var(--color-secondary);
  }
  .evolved-name {
    color: var(--color-secondary);
  }
  .evolved-tag {
    color: var(--color-secondary);
  }

  .operator {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-text-faint);
  }

  .recipe-desc {
    margin: 0.65rem 0 0;
    padding-top: 0.55rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    font-size: var(--fs-caption);
    line-height: 1.45;
    color: var(--color-text-dim);
  }

  @media (min-width: 780px) {
    .evolutions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }
  }
</style>
