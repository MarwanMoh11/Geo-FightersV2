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

<!-- Background (texture + scanlines) comes from the global #main-menu styles -->
<div id="main-menu" class:hidden={uiState.gameState !== 'MENU'}>
  <div class="menu-content">
    <div class="logo-container">
      <h1 class="game-title">GEO<span class="accent">FIGHTERS</span></h1>
      <div class="tagline">NEURAL COMBAT PROTOCOL V2.0</div>
    </div>

    <div class="menu-actions">
      <button class="action primary" onclick={startGame}>
        <span class="btn-text">INITIALIZE SYSTEM</span>
        <span class="btn-subtext">START MISSION</span>
      </button>

      <button class="action" onclick={openSettings}>
        <span class="btn-text">CONFIGURATION</span>
        <span class="btn-subtext">SYSTEM SETTINGS</span>
      </button>
    </div>

    <div class="menu-footer">
      <p class="status-text">SYSTEM STATUS: <span class="online">ONLINE</span></p>
      <p class="version">BUILD {__APP_VERSION__}</p>
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
    z-index: 1000;
  }

  #main-menu.hidden {
    display: none;
  }

  .menu-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3rem;
    text-align: center;
    animation: menu-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .game-title {
    margin: 0;
    font-family: var(--font-heading);
    font-size: clamp(48px, 11vw, 88px);
    font-weight: 900;
    letter-spacing: 0.1em;
    color: var(--color-text-main);
    text-shadow:
      0 0 20px var(--color-primary),
      0 0 70px var(--color-primary);
  }

  .game-title .accent {
    color: var(--color-secondary);
    text-shadow:
      0 0 20px var(--color-secondary),
      0 0 70px var(--color-secondary);
  }

  .tagline {
    margin-top: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.55em;
    text-indent: 0.55em;
    color: var(--color-text-dim);
  }

  .menu-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(82vw, 320px);
  }

  .action {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 1.1rem 2rem;
    border-radius: 14px;
    background: rgba(8, 12, 24, 0.75);
    border: 1px solid var(--color-border);
    backdrop-filter: blur(8px);
    transition: all var(--transition-smooth);
  }

  .action:hover {
    border-color: var(--color-border-bright);
    box-shadow: 0 0 28px rgba(0, 229, 255, 0.25);
    transform: translateY(-3px);
  }

  .action:active {
    transform: translateY(0) scale(0.98);
  }

  .action.primary {
    background: linear-gradient(180deg, rgba(0, 229, 255, 0.16), rgba(0, 229, 255, 0.05));
    border-color: var(--color-border-bright);
    animation: primary-pulse 2.4s ease-in-out infinite;
  }

  .action.primary:hover {
    box-shadow: 0 0 38px rgba(0, 229, 255, 0.45);
  }

  @keyframes primary-pulse {
    0%,
    100% {
      box-shadow: 0 0 16px rgba(0, 229, 255, 0.18);
    }
    50% {
      box-shadow: 0 0 30px rgba(0, 229, 255, 0.4);
    }
  }

  .btn-text {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.14em;
    color: var(--color-text-main);
  }

  .action.primary .btn-text {
    color: var(--color-primary);
    text-shadow: 0 0 12px rgba(0, 229, 255, 0.6);
  }

  .btn-subtext {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    color: var(--color-text-dim);
  }

  .menu-footer {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.25em;
    color: var(--color-text-dim);
  }

  .menu-footer p {
    margin: 0;
  }

  .online {
    color: var(--color-accent);
    text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
    animation: online-blink 2s ease-in-out infinite;
  }

  @keyframes online-blink {
    50% {
      opacity: 0.55;
    }
  }

  .version {
    opacity: 0.55;
  }
</style>
