<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { selectUpgrade, type UpgradeOption } from '../../systems/UpgradeSystem';

  function handleSelect(option: UpgradeOption) {
    selectUpgrade(option);
    uiState.showUpgrade = false;
  }

  function getRarityColor(rarity: string = 'common') {
    switch (rarity) {
      case 'epic':
        return 'var(--color-secondary)';
      case 'rare':
        return 'var(--color-primary)';
      case 'uncommon':
        return 'var(--color-accent)';
      default:
        return 'var(--color-text-dim)';
    }
  }
</script>

<div id="upgrade-modal" class:hidden={!uiState.showUpgrade}>
  <div class="modal-overlay"></div>

  <div class="upgrade-content">
    <div class="header">
      <h2 class="title">SYSTEM EVOLUTION</h2>
      <div class="subtitle">SELECT ENHANCEMENT PROTOCOL</div>
    </div>

    <div class="cards-container">
      {#each uiState.upgradeChoices as option}
        {@const color = getRarityColor(option.rarity)}
        <button
          class="upgrade-card glass"
          onclick={() => handleSelect(option)}
          style="--rarity-color: {color}"
        >
          <div class="rarity-tag">{option.rarity || 'COMMON'}</div>

          <div class="item-icon">
            {#if option.icon && option.icon.endsWith('.png')}
              <img src={option.icon} alt={option.name} class="icon-img" />
            {:else}
              {option.icon || '📦'}
            {/if}
          </div>

          <div class="item-info">
            <h3 class="item-name">{option.name}</h3>
            <p class="item-desc">{option.description}</p>
          </div>
          <div class="selection-glow"></div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  #upgrade-modal {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(10, 10, 18, 0.8);
    backdrop-filter: blur(10px);
  }

  .hidden {
    display: none !important;
  }

  .modal-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%);
    pointer-events: none;
  }

  .upgrade-content {
    width: min(95%, 800px);
    display: flex;
    flex-direction: column;
    gap: 3rem;
    z-index: 1;
  }

  .header {
    text-align: center;
    animation: fade-up 0.5s ease-out;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 2.5rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    margin: 0;
    color: var(--color-text-main);
  }

  .subtitle {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.4em;
    color: var(--color-primary);
    margin-top: 0.5rem;
  }

  .cards-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.5rem;
  }

  .upgrade-card {
    all: unset;
    cursor: pointer;
    position: relative;
    padding: 2rem;
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 1.5rem;
    transition: all var(--transition-smooth);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
    animation: card-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .upgrade-card:hover {
    transform: translateY(-10px) scale(1.02);
    border-color: var(--rarity-color);
    background: rgba(255, 255, 255, 0.05);
  }

  .rarity-tag {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--rarity-color);
    padding: 0.25rem 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 99px;
    border: 1px solid var(--rarity-color);
  }

  .item-icon {
    font-size: 3.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80px;
    width: 80px;
  }

  .icon-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 10px var(--rarity-color));
  }

  .item-name {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: var(--color-text-main);
  }

  .item-desc {
    font-size: 0.85rem;
    color: var(--color-text-dim);
    line-height: 1.4;
    margin: 0;
  }

  .selection-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, var(--rarity-color) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s ease;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  .upgrade-card:hover .selection-glow {
    opacity: 0.2;
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(40px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 600px) {
    .cards-container {
      grid-template-columns: 1fr;
    }

    .upgrade-card {
      flex-direction: row;
      text-align: left;
      padding: 1.25rem;
      gap: 1.25rem;
    }

    .item-icon {
      font-size: 2.5rem;
      width: 60px;
      height: 60px;
    }

    .rarity-tag {
      position: absolute;
      top: 1rem;
      right: 1rem;
    }
  }
</style>
