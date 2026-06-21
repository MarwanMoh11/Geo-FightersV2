<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { resumeAudioContext } from '../core/audio';
  import { hostRoom, joinRoom, disconnectNetwork } from '../core/network';
  import { promptInstall } from '../core/pwa';
  import { haptics } from '../core/haptics';

  let showMpOptions = $state(false);
  let roomCodeInput = $state('');

  async function handleInstall() {
    haptics.select();
    await promptInstall();
  }

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

<div id="main-menu" class:hidden={uiState.gameState !== 'MENU'}>
  <div class="menu-content">
    <header class="brand">
      <h1 class="wordmark">GEO<span class="accent">FIGHTERS</span></h1>
      <div class="tagline">SURVIVE THE HORDE</div>
    </header>

    <div class="menu-actions">
      {#if !showMpOptions && uiState.networkStatus === 'disconnected'}
        <button class="btn primary" onclick={startSinglePlayer}>
          <span class="label">Play</span>
          <span class="sub">Solo run</span>
        </button>

        <button class="btn" onclick={() => (showMpOptions = true)}>
          <span class="label">Co-op</span>
          <span class="sub">Online</span>
        </button>

        <button class="btn" onclick={openSettings}>
          <span class="label">Settings</span>
        </button>

        {#if uiState.canInstall}
          <button class="btn ghost" onclick={handleInstall}>
            <span class="label install">Install app</span>
          </button>
        {/if}
      {:else if showMpOptions && uiState.networkStatus === 'disconnected'}
        <button class="btn primary" onclick={handleHost}>
          <span class="label">Host lobby</span>
          <span class="sub">Create beacon</span>
        </button>

        <div class="join-row">
          <input
            type="text"
            maxlength="4"
            placeholder="CODE"
            class="code-input tnum"
            bind:value={roomCodeInput}
          />
          <button class="btn join" onclick={handleJoin}>
            <span class="label">Join</span>
          </button>
        </div>

        <button class="btn ghost danger" onclick={handleCancelMp}>
          <span class="label">Back</span>
        </button>

        <label class="server-config">
          <span class="eyebrow">Signaling beacon</span>
          <input
            type="text"
            placeholder="auto"
            class="server-input"
            bind:value={uiState.customServerUrl}
            oninput={() => localStorage.setItem('geo_server_url', uiState.customServerUrl)}
          />
        </label>
      {:else}
        <div class="status-panel">
          {#if uiState.networkStatus === 'connecting'}
            <div class="spinner"></div>
            <p class="status-heading">Connecting</p>
            <p class="status-detail">Pinging beacon…</p>
          {:else if uiState.networkStatus === 'waiting_for_players'}
            <div class="code-box">
              <p class="lobby-code tnum">{uiState.roomCode}</p>
            </div>
            <p class="status-heading">Lobby online</p>
            <p class="status-detail">Waiting for teammate…</p>
          {/if}
          <button class="btn ghost danger" onclick={handleCancelMp}>
            <span class="label">Abort</span>
          </button>
        </div>
      {/if}
    </div>

    <footer class="menu-footer">
      <span class="online">● ONLINE</span>
      <span class="version tnum">v{__APP_VERSION__}</span>
    </footer>
  </div>
</div>

<style>
  #main-menu {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(54, 230, 255, 0.08), transparent 70%),
      radial-gradient(ellipse 80% 50% at 50% 100%, rgba(255, 61, 119, 0.06), transparent 70%),
      var(--color-bg-dark);
    padding: calc(var(--safe-top) + 2rem) 1.5rem calc(var(--safe-bottom) + 2rem);
  }

  #main-menu.hidden {
    display: none;
  }

  .menu-content {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2.5rem;
    animation: menu-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ---- Brand ---- */
  .brand {
    text-align: center;
    margin-top: auto;
  }
  .wordmark {
    margin: 0;
    font-family: var(--font-heading);
    font-size: clamp(36px, 11vw, 58px);
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 0.92;
    color: var(--color-text-main);
    /* Stack GEO / FIGHTERS so the long wordmark never overflows narrow screens */
    overflow-wrap: anywhere;
  }
  .wordmark .accent {
    display: block;
    color: var(--color-primary);
  }
  .tagline {
    margin-top: 0.85rem;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.42em;
    text-indent: 0.42em;
    color: var(--color-text-dim);
  }

  /* ---- Actions ---- */
  .menu-actions {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .btn {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
  }
  .btn:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.16);
  }
  .btn:active {
    transform: scale(0.985);
  }

  .btn .label {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--color-text-main);
  }
  .btn .sub {
    font-size: 0.62rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }

  .btn.primary {
    background: var(--color-primary);
    border-color: transparent;
  }
  .btn.primary .label {
    color: #04060f;
  }
  .btn.primary .sub {
    color: rgba(4, 6, 15, 0.6);
  }
  .btn.primary:hover {
    filter: brightness(1.08);
  }

  .btn.ghost {
    background: transparent;
    justify-content: center;
  }
  .btn.ghost .label {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .btn.ghost.danger:hover {
    border-color: rgba(255, 61, 119, 0.4);
  }
  .btn.ghost.danger .label {
    color: var(--color-text-dim);
  }
  .label.install {
    color: var(--color-accent);
  }

  /* ---- Multiplayer ---- */
  .join-row {
    display: flex;
    gap: 0.5rem;
  }
  .code-input {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--color-border);
    border-radius: var(--r-md);
    padding: 0 1rem;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-primary);
    text-align: center;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    outline: none;
  }
  .code-input:focus {
    border-color: var(--color-border-bright);
  }
  .btn.join {
    flex: 0 0 auto;
    justify-content: center;
    padding: 1rem 1.4rem;
  }

  .server-config {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }
  .server-config .eyebrow {
    padding-left: 0.2rem;
  }
  .server-input {
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--color-border);
    border-radius: var(--r-sm);
    padding: 0.55rem 0.8rem;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--color-text-main);
    outline: none;
    text-align: center;
  }
  .server-input:focus {
    border-style: solid;
    border-color: var(--color-border-bright);
  }

  /* ---- Connection status ---- */
  .status-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 1rem 0;
  }
  .status-heading {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-text-main);
  }
  .status-detail {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
  }
  .code-box {
    background: rgba(54, 230, 255, 0.06);
    border: 1px solid var(--color-border-bright);
    border-radius: var(--r-md);
    padding: 0.7rem 1.5rem;
  }
  .lobby-code {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-indent: 0.25em;
    color: var(--color-primary);
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid rgba(255, 255, 255, 0.12);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ---- Footer ---- */
  .menu-footer {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--color-text-faint);
  }
  .online {
    color: var(--color-accent);
  }
</style>
