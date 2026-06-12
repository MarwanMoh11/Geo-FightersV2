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
      uiState.showUpgrade = false;
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
        <h2 class="title">SYSTEM EVOLUTION</h2>
        <div class="subtitle">SELECT ENHANCEMENT PROTOCOL</div>
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
              {#if option.icon && option.icon.endsWith('.png')}
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
    background: rgba(4, 4, 16, 0.8);
    backdrop-filter: blur(10px);
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
  }

  .title {
    font-family: var(--font-heading);
    font-size: 2.5rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    margin: 0;
    color: var(--color-text-main);
    text-shadow: 0 0 24px rgba(0, 229, 255, 0.45);
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
    gap: 1.25rem;
    transition: all var(--transition-smooth);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
    animation: card-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .upgrade-card:hover,
  .upgrade-card:focus-visible,
  .upgrade-card.key-focused {
    transform: translateY(-10px) scale(1.02);
    border-color: var(--rarity-color);
    background: rgba(255, 255, 255, 0.05);
  }

  .upgrade-card.key-focused {
    box-shadow: 0 0 24px color-mix(in srgb, var(--rarity-color) 45%, transparent);
  }

  .upgrade-card.key-focused .selection-glow {
    opacity: 0.25;
  }

  .upgrade-card:focus-visible {
    outline: 2px solid var(--rarity-color);
    outline-offset: 3px;
  }

  .upgrade-card:active {
    transform: translateY(-6px) scale(0.99);
  }

  /* Commit animation: chosen card flares, the others fall away */
  .upgrade-card.selected {
    transform: scale(1.06);
    border-color: var(--rarity-color);
    box-shadow: 0 0 40px var(--rarity-color);
    animation: selected-flash 0.35s ease-out both;
  }

  .upgrade-card.dimmed {
    opacity: 0.25;
    transform: scale(0.96);
    filter: grayscale(0.8);
  }

  @keyframes selected-flash {
    0% {
      background: rgba(255, 255, 255, 0.35);
    }
    100% {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  .hotkey-badge {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--color-text-dim);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.35);
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
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0 0 0.35rem 0;
    color: var(--color-text-main);
  }

  .level-step {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: var(--rarity-color);
    margin-bottom: 0.35rem;
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

  .upgrade-card:hover .selection-glow,
  .upgrade-card.selected .selection-glow {
    opacity: 0.25;
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
      gap: 0.75rem;
    }

    .upgrade-content {
      gap: 1.5rem;
    }

    .title {
      font-size: 1.5rem;
    }

    .upgrade-card {
      flex-direction: row;
      text-align: left;
      padding: 1rem 1.25rem;
      gap: 1.25rem;
    }

    .item-icon {
      font-size: 2.5rem;
      width: 56px;
      height: 56px;
      flex-shrink: 0;
    }

    .item-name {
      font-size: 1rem;
    }

    .item-desc {
      font-size: 0.75rem;
    }

    .rarity-tag {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      font-size: 0.5rem;
    }
  }
</style>
