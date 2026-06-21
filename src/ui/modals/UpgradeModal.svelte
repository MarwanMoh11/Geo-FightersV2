<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { selectUpgrade, type UpgradeOption } from '../../systems/UpgradeSystem';
  import { fade, fly } from 'svelte/transition';
  import { playLevelUp } from '../../core/audio';
  import { haptics } from '../../core/haptics';

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
    playLevelUp();
    haptics.select();

    // Let the selection flash play before applying + resuming the game
    setTimeout(() => {
      selectUpgrade(option);
      selectedId = null;
    }, 350);
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

<svelte:window onkeydown={handleKeydown} />

{#if uiState.showUpgrade}
  <div id="upgrade-modal" transition:fade={{ duration: 250 }}>
    <div class="modal-overlay"></div>

    <div class="upgrade-content">
      <div class="header" in:fly={{ y: -24, duration: 400, delay: 100 }}>
        <h2 class="title">Level Up</h2>
        <div class="subtitle">Choose an upgrade</div>
      </div>

      <div class="cards-container">
        {#each uiState.upgradeChoices as option, i}
          {@const color = getRarityColor(option.rarity)}
          <button
            class="upgrade-card glass"
            class:selected={selectedId === option.id}
            class:dimmed={selectedId !== null && selectedId !== option.id}
            class:key-focused={focusIndex === i && !selectedId}
            onclick={() => handleSelect(option)}
            onmouseenter={() => (focusIndex = i)}
            style="--rarity-color: {color}; animation-delay: {i * 90}ms"
          >
            <span class="hotkey-badge">{i + 1}</span>
            <div class="rarity-tag">{option.rarity || 'COMMON'}</div>

            <div class="item-icon">
              {#if option.icon && option.icon.startsWith('<svg')}
                {@html option.icon}
              {:else if option.icon && option.icon.endsWith('.png')}
                <img src={option.icon} alt={option.name} class="icon-img" />
              {:else}
                {option.icon || '📦'}
              {/if}
            </div>

            <div class="item-info">
              <h3 class="item-name">{option.name}</h3>
              {#if option.nextLevel}
                <div class="level-step">LV {option.currentLevel} → {option.nextLevel}</div>
              {/if}
              <p class="item-desc">{option.description}</p>
            </div>
            <div class="selection-glow"></div>
          </button>
        {/each}
      </div>

      <div class="key-hints" in:fade={{ duration: 400, delay: 300 }}>
        <span><kbd>1</kbd>–<kbd>{uiState.upgradeChoices.length}</kbd> QUICK PICK</span>
        <span><kbd>←</kbd><kbd>→</kbd> BROWSE</span>
        <span><kbd>ENTER</kbd> CONFIRM</span>
      </div>
    </div>
  </div>
{/if}

<style>
  #upgrade-modal {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(4, 6, 15, 0.78);
    backdrop-filter: blur(12px);
    padding: 1.5rem;
    pointer-events: auto;
  }

  .modal-overlay {
    display: none;
  }

  .upgrade-content {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    z-index: 1;
  }

  .header {
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: var(--color-text-main);
  }

  .subtitle {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-primary);
    margin-top: 0.5rem;
  }

  .cards-container {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .upgrade-card {
    all: unset;
    cursor: pointer;
    position: relative;
    padding: 1rem 1.1rem;
    border-radius: var(--r-md);
    display: flex;
    flex-direction: row;
    align-items: center;
    text-align: left;
    gap: 1rem;
    transition: all var(--transition-fast);
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--rarity-color);
    animation: card-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .upgrade-card:hover,
  .upgrade-card:focus-visible,
  .upgrade-card.key-focused {
    border-color: var(--rarity-color);
    border-left-color: var(--rarity-color);
    background: rgba(255, 255, 255, 0.05);
  }

  .upgrade-card.key-focused {
    box-shadow: inset 0 0 0 1px var(--rarity-color);
  }

  .upgrade-card.key-focused .selection-glow {
    opacity: 0.25;
  }

  .upgrade-card:focus-visible {
    outline: 2px solid var(--rarity-color);
    outline-offset: 3px;
  }

  .upgrade-card:active {
    transform: scale(0.99);
  }

  /* Commit animation: chosen card flares, the others fall away */
  .upgrade-card.selected {
    border-color: var(--rarity-color);
    box-shadow: inset 0 0 0 1px var(--rarity-color);
    animation: selected-flash 0.35s ease-out both;
  }

  .upgrade-card.dimmed {
    opacity: 0.3;
    filter: grayscale(0.7);
  }

  @keyframes selected-flash {
    0% {
      background: rgba(255, 255, 255, 0.25);
    }
    100% {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  .hotkey-badge {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--color-text-dim);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.25);
  }

  .key-hints {
    display: flex;
    justify-content: center;
    gap: 2rem;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: var(--color-text-dim);
  }

  .key-hints kbd {
    display: inline-block;
    min-width: 16px;
    padding: 2px 5px;
    margin: 0 2px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    font-family: inherit;
    font-size: 0.6rem;
    text-align: center;
  }

  /* Touch devices: hide keyboard affordances entirely */
  @media (pointer: coarse) {
    .hotkey-badge,
    .key-hints {
      display: none;
    }
  }

  .rarity-tag {
    position: absolute;
    top: 0.6rem;
    right: 0.7rem;
    font-size: 0.46rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--rarity-color);
  }

  .item-icon {
    flex-shrink: 0;
    font-size: 2rem;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 48px;
    width: 48px;
  }

  .item-icon :global(svg) {
    width: 40px;
    height: 40px;
  }

  .icon-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .item-info {
    min-width: 0;
    padding-right: 2.5rem;
  }

  .item-name {
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 0.2rem 0;
    color: var(--color-text-main);
  }

  .level-step {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    color: var(--rarity-color);
    margin-bottom: 0.2rem;
  }

  .item-desc {
    font-size: 0.74rem;
    color: var(--color-text-dim);
    line-height: 1.35;
    margin: 0;
  }

  .selection-glow {
    display: none;
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Wider screens: lay the choices out side by side */
  @media (min-width: 720px) {
    .upgrade-content {
      max-width: 760px;
    }
    .cards-container {
      flex-direction: row;
    }
    .upgrade-card {
      flex: 1;
      flex-direction: column;
      align-items: flex-start;
      padding: 1.5rem;
    }
    .item-icon {
      width: 56px;
      height: 56px;
    }
    .item-info {
      padding-right: 0;
    }
  }
</style>
