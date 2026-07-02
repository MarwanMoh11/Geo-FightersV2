<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { resumeAudioContext, playMenuBuy } from '../core/audio';
  import { hostRoom, joinRoom, disconnectNetwork } from '../core/network';
  import { promptInstall } from '../core/pwa';
  import { haptics } from '../core/haptics';
  import { fade } from 'svelte/transition';

  let showMpOptions = $state(false);
  let roomCodeInput = $state('');
  let showCharacterSelect = $state(false);
  let showShop = $state(false);

  const UPGRADES_LIST = [
    { id: 'might', name: 'Output Wattage (Might)', desc: '+10% Damage Output per level', max: 5, baseCost: 150, costScale: 2.0 },
    { id: 'maxHealth', name: 'Armor Shell (HP)', desc: '+10 Max HP per level', max: 5, baseCost: 100, costScale: 1.8 },
    { id: 'armor', name: 'Reinforced Core (Armor)', desc: '+1 Damage Reduction per level', max: 5, baseCost: 200, costScale: 2.2 },
    { id: 'moveSpeed', name: 'Overclocked Thrusters (Speed)', desc: '+5% Speed per level', max: 5, baseCost: 120, costScale: 1.9 },
    { id: 'magnet', name: 'Tractor Beam (Magnet)', desc: '+20% Magnet Range per level', max: 5, baseCost: 80, costScale: 1.7 },
    { id: 'luck', name: 'Precision Luck', desc: '+10% Critical & Rarity Chance', max: 5, baseCost: 150, costScale: 2.0 },
    { id: 'rerolls', name: 'Defrag Reroll', desc: '+1 Level-Up Reroll per run', max: 3, baseCost: 200, costScale: 2.2 },
    { id: 'banishes', name: 'System Banish', desc: '+1 Level-Up Banish per run', max: 3, baseCost: 250, costScale: 2.5 },
  ];

  function getUpgradeCost(up: typeof UPGRADES_LIST[0], level: number) {
    return Math.floor(up.baseCost * Math.pow(up.costScale, level));
  }

  function buyUpgrade(upId: string) {
    const up = UPGRADES_LIST.find(u => u.id === upId);
    if (!up) return;
    const currentLvl = uiState.permanentUpgrades[upId] || 0;
    if (currentLvl >= up.max) return;
    
    const cost = getUpgradeCost(up, currentLvl);
    if (uiState.credits >= cost) {
      uiState.credits -= cost;
      uiState.permanentUpgrades[upId] = currentLvl + 1;
      
      // Save to localStorage
      localStorage.setItem('geo_credits', JSON.stringify(uiState.credits));
      localStorage.setItem('geo_permanent_upgrades', JSON.stringify(uiState.permanentUpgrades));
      
      playMenuBuy();
      haptics.select();
    }
  }

  async function handleInstall() {
    haptics.select();
    await promptInstall();
  }

  function handlePlaySolo() {
    haptics.select();
    showCharacterSelect = true;
  }

  function selectCharacter(charId: 'cypher' | 'lash' | 'rail') {
    uiState.selectedCharacter = charId;
    localStorage.setItem('geo_selected_character', JSON.stringify(charId));
    showCharacterSelect = false;
    startSinglePlayer();
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

  function saveName() {
    localStorage.setItem('geo_player_name', uiState.playerName.trim());
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
        <button class="btn primary" onclick={handlePlaySolo}>
          <span class="label">Play</span>
          <span class="sub">Solo run</span>
        </button>

        <button class="btn" onclick={() => (showShop = true)}>
          <span class="label">Shop</span>
          <span class="sub">Upgrades</span>
        </button>

        <button class="btn" onclick={() => (uiState.showGrimoire = true)}>
          <span class="label">Evolutions</span>
          <span class="sub">Recipe Guide</span>
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
        <label class="name-config">
          <span class="eyebrow">Call sign</span>
          <input
            type="text"
            maxlength="12"
            placeholder="PLAYER"
            class="name-input"
            bind:value={uiState.playerName}
            oninput={saveName}
          />
        </label>

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

  <!-- Shop Overlay -->
  {#if showShop}
    <div class="sub-panel glass" transition:fade={{ duration: 180 }}>
      <header class="panel-header">
        <h2 class="panel-title">Cybernetic Shop</h2>
        <div class="panel-credits">🪙 {uiState.credits} Credits</div>
      </header>

      <div class="scroll-area">
        <div class="shop-grid">
          {#each UPGRADES_LIST as up}
            {@const level = uiState.permanentUpgrades[up.id] || 0}
            {@const cost = getUpgradeCost(up, level)}
            {@const maxed = level >= up.max}
            <div class="shop-card" class:maxed>
              <div class="card-details">
                <h3 class="card-name">{up.name}</h3>
                <p class="card-desc">{up.desc}</p>
                <div class="level-indicator">
                  {#each Array(up.max) as _, i}
                    <div class="dot-indicator" class:active={i < level}></div>
                  {/each}
                  <span class="level-text">LV {level}/{up.max}</span>
                </div>
              </div>
              <button class="buy-btn" class:disabled={maxed || uiState.credits < cost} onclick={() => buyUpgrade(up.id)}>
                {#if maxed}
                  MAXED
                {:else}
                  🪙 {cost}
                {/if}
              </button>
            </div>
          {/each}
        </div>
      </div>

      <button class="btn back-btn" onclick={() => (showShop = false)}>Back to Menu</button>
    </div>
  {/if}

  <!-- Character Selection Overlay -->
  {#if showCharacterSelect}
    <div class="sub-panel glass" transition:fade={{ duration: 180 }}>
      <header class="panel-header">
        <h2 class="panel-title">Select Avatar</h2>
        <p class="panel-subtitle">Choose your starting configuration</p>
      </header>

      <div class="char-grid">
        <!-- Cypher -->
        <button class="char-card" onclick={() => selectCharacter('cypher')}>
          <div class="char-icon core-cyan">💠</div>
          <h3 class="char-name">CYPHER</h3>
          <p class="char-weapon">MK-1 Pulse Repeater</p>
          <p class="char-desc">Fires directional energy bolts. Extremely balanced and reliable for long deployments.</p>
          <div class="char-stats">
            <span>HP: 100</span>
            <span>SPD: 100%</span>
            <span>Might: 100%</span>
          </div>
        </button>

        <!-- Lash -->
        <button class="char-card" onclick={() => selectCharacter('lash')}>
          <div class="char-icon core-magenta">🧬</div>
          <h3 class="char-name">LASH</h3>
          <p class="char-weapon">Monowire Lash</p>
          <p class="char-desc">Swift and agile combatant using slicing filaments. High speed and critical hits, but lower protection.</p>
          <div class="char-stats">
            <span>HP: 90</span>
            <span class="green">SPD: 115%</span>
            <span class="green">Luck: 110%</span>
          </div>
        </button>

        <!-- Rail -->
        <button class="char-card" onclick={() => selectCharacter('rail')}>
          <div class="char-icon core-green">⚙️</div>
          <h3 class="char-name">RAIL</h3>
          <p class="char-weapon">Smart Rail Needles</p>
          <p class="char-desc">Heavily armored defensive platform deploying rail Needles. Slow velocity, but high destruction.</p>
          <div class="char-stats">
            <span class="green">HP: 120</span>
            <span class="red">SPD: 90%</span>
            <span class="green">Might: 115%</span>
            <span class="green">Armor: +1</span>
          </div>
        </button>
      </div>

      <button class="btn back-btn" onclick={() => (showCharacterSelect = false)}>Back to Menu</button>
    </div>
  {/if}
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
    width: 100%;
    font-family: var(--font-heading);
    font-size: clamp(36px, 11vw, 58px);
    font-weight: 800;
    letter-spacing: 0.04em;
    /* Compensate the trailing letter-spacing so centered text stays centered */
    text-indent: 0.04em;
    text-align: center;
    line-height: 0.92;
    color: var(--color-text-main);
    /* Stack GEO / FIGHTERS so the long wordmark never overflows narrow screens */
    overflow-wrap: anywhere;
  }
  .wordmark .accent {
    display: block;
    text-indent: 0.04em;
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

  .name-config {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.25rem;
  }
  .name-config .eyebrow {
    padding-left: 0.2rem;
  }
  .name-input {
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--color-border);
    border-radius: var(--r-md);
    padding: 0.7rem 1rem;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-main);
    text-align: center;
    outline: none;
  }
  .name-input:focus {
    border-color: var(--color-border-bright);
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

  /* ---- Shop and Character Overlays ---- */
  .sub-panel {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: rgba(4, 6, 15, 0.85);
    backdrop-filter: blur(14px);
    padding: calc(var(--safe-top) + 2rem) 1.5rem calc(var(--safe-bottom) + 2rem);
    animation: menu-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    overflow-y: auto;
    pointer-events: auto;
  }

  .panel-header {
    text-align: center;
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .panel-title {
    font-family: var(--font-heading);
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    color: var(--color-text-main);
  }

  .panel-subtitle {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    margin: 0;
  }

  .panel-credits {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-gold);
    background: rgba(255, 170, 0, 0.1);
    border: 1px solid rgba(255, 170, 0, 0.25);
    border-radius: var(--r-pill);
    padding: 0.25rem 1rem;
    margin-top: 0.5rem;
  }

  .scroll-area {
    flex: 1;
    overflow-y: auto;
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    padding-right: 0.5rem;
    display: flex;
    flex-direction: column;
  }

  .shop-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 2rem;
  }

  .shop-card {
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--color-border);
    border-radius: var(--r-md);
    padding: 1rem;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    transition: all var(--transition-fast);
  }
  .shop-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .shop-card.maxed {
    border-color: rgba(0, 255, 85, 0.15);
    background: rgba(0, 255, 85, 0.01);
  }

  .card-details {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    text-align: left;
  }

  .card-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-text-main);
    margin: 0;
  }

  .card-desc {
    font-size: 0.72rem;
    color: var(--color-text-dim);
    margin: 0;
    line-height: 1.3;
  }

  .level-indicator {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.2rem;
  }

  .dot-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
  }
  .dot-indicator.active {
    background: var(--color-primary);
    box-shadow: 0 0 4px var(--color-primary);
  }
  .shop-card.maxed .dot-indicator.active {
    background: var(--color-accent);
    box-shadow: 0 0 4px var(--color-accent);
  }

  .level-text {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: var(--color-text-dim);
    margin-left: 0.4rem;
  }

  .buy-btn {
    all: unset;
    cursor: pointer;
    background: var(--color-secondary);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    padding: 0.6rem 0.9rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    text-align: center;
    min-width: 70px;
    transition: all var(--transition-fast);
  }
  .buy-btn:hover:not(.disabled) {
    filter: brightness(1.12);
  }
  .buy-btn:active:not(.disabled) {
    transform: scale(0.96);
  }
  .buy-btn.disabled {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--color-border);
    color: var(--color-text-dim);
    cursor: not-allowed;
  }
  .shop-card.maxed .buy-btn {
    background: rgba(0, 255, 85, 0.08);
    border-color: rgba(0, 255, 85, 0.25);
    color: var(--color-accent);
    cursor: default;
  }

  .back-btn {
    width: 100%;
    max-width: 260px;
    margin: 1.5rem auto 0;
    justify-content: center;
  }

  /* ---- Character Select ---- */
  .char-grid {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    width: 100%;
    max-width: 540px;
    margin: auto;
  }

  .char-card {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--color-border);
    border-radius: var(--r-md);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 0.4rem;
    transition: all var(--transition-fast);
  }
  .char-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: var(--color-primary);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }
  .char-card:active {
    transform: scale(0.99);
  }

  .char-icon {
    font-size: 1.8rem;
    margin-bottom: 0.2rem;
  }
  
  .char-name {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--color-text-main);
    margin: 0;
  }

  .char-weapon {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-primary);
    margin: 0;
  }

  .char-desc {
    font-size: 0.74rem;
    color: var(--color-text-dim);
    margin: 0;
    line-height: 1.35;
  }

  .char-stats {
    display: flex;
    flex-direction: row;
    gap: 0.8rem;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 600;
    color: var(--color-text-dim);
    margin-top: 0.4rem;
  }
  
  .char-stats span {
    background: rgba(255, 255, 255, 0.04);
    padding: 0.15rem 0.4rem;
    border-radius: var(--r-sm);
  }
  
  .char-stats span.green {
    color: var(--color-accent);
    background: rgba(0, 255, 85, 0.06);
  }

  .char-stats span.red {
    color: var(--color-secondary);
    background: rgba(255, 61, 119, 0.06);
  }

  /* Responsive wide styling for character cards */
  @media (min-width: 600px) {
    .char-grid {
      flex-direction: row;
      max-width: 900px;
    }
    .char-card {
      flex: 1;
      min-height: 260px;
      justify-content: flex-start;
    }
  }
</style>
