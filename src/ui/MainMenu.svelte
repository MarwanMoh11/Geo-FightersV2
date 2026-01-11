<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { resumeAudioContext } from '../core/audio';

  async function startGame() {
    await resumeAudioContext();
    setGameState('PLAYING');
  }

  function openSettings() {
    uiState.showSettings = true;
  }
</script>

<div id="main-menu" class:hidden={uiState.gameState !== 'MENU'}>
  <div class="menu-overlay"></div>

  <div class="menu-content glass">
    <div class="logo-container">
      <h1 class="game-title">GEO<span class="accent">FIGHTERS</span></h1>
      <div class="tagline">NEURAL COMBAT PROTOCOL V2.0</div>
    </div>

    <div class="menu-actions">
      <button class="menu-btn primary glow" onclick={startGame}>
        <span class="btn-text">INITIALIZE SYSTEM</span>
        <span class="btn-subtext">START MISSION</span>
      </button>

      <button class="menu-btn secondary" onclick={openSettings}>
        <span class="btn-text">CONFIGURATION</span>
        <span class="btn-subtext">SYSTEM SETTINGS</span>
      </button>
    </div>

    <div class="menu-footer">
      <p class="status-text">SYSTEM STATUS: <span class="online">ONLINE</span></p>
      <p class="version">BUILD 2026.01.11</p>
    </div>
  </div>
</div>

<style>
  #main-menu {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: radial-gradient(circle at center, #1a1a2e 0%, #0a0a12 100%);
    z-index: 1000;
  }

  .menu-overlay {
    position: absolute;
    inset: 0;
    background: url('/textures/ui/grid.png'); /* Hypothetical grid, fallback to CSS grid */
    background-size: 50px 50px;
    opacity: 0.1;
    pointer-events: none;
  }

  #main-menu.hidden {
    display: none;
  }
</style>
