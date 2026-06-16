<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { resumeAudioContext } from '../core/audio';
  import { hostRoom, joinRoom, disconnectNetwork } from '../core/network';

  let showMpOptions = $state(false);
  let roomCodeInput = $state('');

  async function startSinglePlayer() {
    await resumeAudioContext();
    uiState.isMultiplayer = false;
    uiState.isHost = false;
    setGameState('PLAYING');
  }

  async function handleHost() {
    await resumeAudioContext();
    hostRoom();
  }

  async function handleJoin() {
    if (!roomCodeInput.trim()) {
      alert('Please enter a room code.');
      return;
    }
    await resumeAudioContext();
    joinRoom(roomCodeInput.trim().toUpperCase());
  }

  function handleCancelMp() {
    disconnectNetwork();
    showMpOptions = false;
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
      {#if !showMpOptions && uiState.networkStatus === 'disconnected'}
        <!-- Standard Main Menu -->
        <button class="action primary" onclick={startSinglePlayer}>
          <span class="btn-text">SINGLE PLAYER</span>
          <span class="btn-subtext">START SOLO MISSION</span>
        </button>

        <button class="action" onclick={() => showMpOptions = true}>
          <span class="btn-text">MULTIPLAYER CO-OP</span>
          <span class="btn-subtext">CONNECT PROTOCOL</span>
        </button>

        <button class="action" onclick={openSettings}>
          <span class="btn-text">CONFIGURATION</span>
          <span class="btn-subtext">SYSTEM SETTINGS</span>
        </button>
      {:else if showMpOptions && uiState.networkStatus === 'disconnected'}
        <!-- Multiplayer Choices -->
        <button class="action primary" onclick={handleHost}>
          <span class="btn-text">HOST LOBBY</span>
          <span class="btn-subtext">CREATE NEW BEACON</span>
        </button>

        <div class="join-container">
          <input
            type="text"
            maxlength="4"
            placeholder="CODE"
            class="room-input"
            bind:value={roomCodeInput}
          />
          <button class="action join-btn" onclick={handleJoin}>
            <span class="btn-text">JOIN</span>
          </button>
        </div>

        <button class="action cancel-btn" onclick={handleCancelMp}>
          <span class="btn-text">RETURN</span>
        </button>

        <div class="server-config-container">
          <span class="server-config-label">SIGNALING BEACON:</span>
          <input
            type="text"
            placeholder="AUTO (e.g. http://192.168.1.15:3001)"
            class="server-input"
            bind:value={uiState.customServerUrl}
            oninput={() => localStorage.setItem('geo_server_url', uiState.customServerUrl)}
          />
        </div>
      {:else}
        <!-- Connection Status Screen -->
        <div class="status-panel">
          {#if uiState.networkStatus === 'connecting'}
            <div class="spinner"></div>
            <p class="status-heading">ESTABLISHING CONNECTION</p>
            <p class="status-detail">PINGING SIGNALLING BEACON...</p>
          {:else if uiState.networkStatus === 'waiting_for_players'}
            <div class="glow-box">
              <p class="lobby-code">{uiState.roomCode}</p>
            </div>
            <p class="status-heading">LOBBY BEACON ONLINE</p>
            <p class="status-detail">WAITING FOR TEAMMATE TO SYNC...</p>
          {/if}
          <button class="action cancel-btn" onclick={handleCancelMp}>
            <span class="btn-text">ABORT CONNECTION</span>
          </button>
        </div>
      {/if}
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

  .join-container {
    display: flex;
    gap: 0.5rem;
    width: min(82vw, 320px);
  }

  .room-input {
    flex: 1;
    background: rgba(8, 12, 24, 0.75);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    padding: 0 1rem;
    font-family: var(--font-mono);
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--color-primary);
    text-align: center;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    outline: none;
    transition: all var(--transition-smooth);
    box-sizing: border-box;
  }

  .room-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.2);
  }

  .join-btn {
    padding: 1.1rem 1.5rem !important;
    width: auto !important;
  }

  .cancel-btn {
    border-color: rgba(255, 68, 68, 0.3) !important;
  }

  .cancel-btn:hover {
    border-color: rgba(255, 68, 68, 0.6) !important;
    box-shadow: 0 0 20px rgba(255, 68, 68, 0.2) !important;
  }

  .cancel-btn .btn-text {
    color: rgba(255, 68, 68, 0.8) !important;
  }

  .status-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    width: min(82vw, 320px);
  }

  .status-heading {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 1.0rem;
    letter-spacing: 0.1em;
    color: var(--color-text-main);
  }

  .status-detail {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--color-text-dim);
    letter-spacing: 0.1em;
  }

  .glow-box {
    background: rgba(0, 229, 255, 0.05);
    border: 1px solid var(--color-primary);
    border-radius: 14px;
    padding: 0.8rem 1.6rem;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.25);
    animation: beacon-pulse 2s ease-in-out infinite;
  }

  @keyframes beacon-pulse {
    0%, 100% {
      opacity: 0.9;
      box-shadow: 0 0 20px rgba(0, 229, 255, 0.2);
    }
    50% {
      opacity: 1;
      box-shadow: 0 0 32px rgba(0, 229, 255, 0.4);
    }
  }

  .lobby-code {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 2.2rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    color: var(--color-primary);
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(0, 229, 255, 0.1);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .server-config-container {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: min(82vw, 320px);
    margin-top: 0.5rem;
  }

  .server-config-label {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--color-text-dim);
    letter-spacing: 0.1em;
    text-align: left;
    padding-left: 0.2rem;
  }

  .server-input {
    background: rgba(8, 12, 24, 0.4);
    border: 1px dashed rgba(0, 229, 255, 0.3);
    border-radius: 8px;
    padding: 0.5rem 0.8rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-text-main);
    outline: none;
    transition: all var(--transition-smooth);
    box-sizing: border-box;
    text-align: center;
  }

  .server-input:focus {
    border-style: solid;
    border-color: var(--color-primary);
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.15);
    background: rgba(8, 12, 24, 0.7);
  }
</style>
