<script lang="ts">
  import { uiState, showToast, saveLocal } from '../core/UIState.svelte.ts';
  import { setGameState } from '../core/GameState';
  import { resumeAudioContext, playMenuBuy, playMenuClick } from '../core/audio';
  import {
    hostRoom,
    joinRoom,
    disconnectNetwork,
    setLobbyState,
    startPartyGame,
    getLocalConnectionId,
  } from '../core/network';
  import { promptInstall } from '../core/pwa';
  import { haptics } from '../core/haptics';
  import { CHARACTERS, getCharacter } from '../core/CharacterRegistry';
  import {
    CORRUPTION_MAX,
    corruptionTierName,
    corruptionHp,
    corruptionDamage,
    corruptionSpeed,
    corruptionXp,
  } from '../core/corruption';
  import {
    isCharacterUnlocked,
    getUnlockCondition,
    getLifetimeStats,
  } from '../core/ProgressManager';
  import {
    getDailyConfig,
    isDailyAvailable,
    getDailyState,
    beginDailyRun,
  } from '../core/DailyManager';
  import { fade } from 'svelte/transition';

  let showMpOptions = $state(false);
  let roomCodeInput = $state('');
  let showCharacterSelect = $state(false);
  let showShop = $state(false);

  const UPGRADES_LIST = [
    {
      id: 'might',
      name: 'Output Wattage (Might)',
      desc: '+10% Damage Output per level',
      max: 5,
      baseCost: 150,
      costScale: 2.0,
    },
    {
      id: 'maxHealth',
      name: 'Armor Shell (HP)',
      desc: '+10 Max HP per level',
      max: 5,
      baseCost: 100,
      costScale: 1.8,
    },
    {
      id: 'armor',
      name: 'Reinforced Core (Armor)',
      desc: '+1 Damage Reduction per level',
      max: 5,
      baseCost: 200,
      costScale: 2.2,
    },
    {
      id: 'moveSpeed',
      name: 'Overclocked Thrusters (Speed)',
      desc: '+5% Speed per level',
      max: 5,
      baseCost: 120,
      costScale: 1.9,
    },
    {
      id: 'magnet',
      name: 'Tractor Beam (Magnet)',
      desc: '+20% Magnet Range per level',
      max: 5,
      baseCost: 80,
      costScale: 1.7,
    },
    {
      id: 'luck',
      name: 'Precision Luck',
      desc: '+10% Critical & Rarity Chance',
      max: 5,
      baseCost: 150,
      costScale: 2.0,
    },
    {
      id: 'rerolls',
      name: 'Defrag Reroll',
      desc: '+1 Level-Up Reroll per run',
      max: 3,
      baseCost: 200,
      costScale: 2.2,
    },
    {
      id: 'banishes',
      name: 'System Banish',
      desc: '+1 Level-Up Banish per run',
      max: 3,
      baseCost: 250,
      costScale: 2.5,
    },
  ];

  function getUpgradeCost(up: (typeof UPGRADES_LIST)[0], level: number) {
    return Math.floor(up.baseCost * Math.pow(up.costScale, level));
  }

  function buyUpgrade(upId: string) {
    const up = UPGRADES_LIST.find((u) => u.id === upId);
    if (!up) return;
    const currentLvl = uiState.permanentUpgrades[upId] || 0;
    if (currentLvl >= up.max) return;

    const cost = getUpgradeCost(up, currentLvl);
    if (uiState.credits >= cost) {
      uiState.credits -= cost;
      uiState.permanentUpgrades[upId] = currentLvl + 1;

      // Save to localStorage
      saveLocal('geo_credits', JSON.stringify(uiState.credits));
      saveLocal('geo_permanent_upgrades', JSON.stringify(uiState.permanentUpgrades));

      playMenuBuy();
      haptics.select();
    }
  }

  async function handleInstall() {
    playMenuClick();
    haptics.select();
    await promptInstall();
  }

  function handlePlaySolo() {
    playMenuClick();
    haptics.select();
    showCharacterSelect = true;
  }

  function selectCharacter(charId: string) {
    if (!isCharacterUnlocked(charId)) {
      const gate = getUnlockCondition('character', charId);
      if (gate) {
        const pct = Math.floor(Math.min(1, gate.progress(getLifetimeStats()) / gate.target) * 100);
        showToast(`🔒 ${gate.description} (${pct}%)`);
      }
      return;
    }
    playMenuClick();
    uiState.selectedCharacter = charId;
    saveLocal('geo_selected_character', JSON.stringify(charId));
    showCharacterSelect = false;
    startSinglePlayer();
  }

  async function startSinglePlayer() {
    await resumeAudioContext();
    uiState.isMultiplayer = false;
    uiState.isHost = false;
    setGameState('PLAYING');
  }

  // --- Corruption dial (0-10 risk/reward, 5 = standard, persisted) ---
  function setCorruption(delta: number) {
    playMenuClick();
    haptics.select();
    uiState.corruption = Math.max(0, Math.min(CORRUPTION_MAX, uiState.corruption + delta));
    saveLocal('geo_corruption_v2', JSON.stringify(uiState.corruption));
  }

  // --- Daily run ---
  const dailyConfig = getDailyConfig();
  let dailyAvailable = $state(isDailyAvailable());
  let dailyBest = $state(getDailyState().bestScore);

  async function handleDaily() {
    if (!dailyAvailable) {
      showToast(`Daily attempt used — next run in ${hoursToReset()}h. Best: ${dailyBest}`);
      return;
    }
    playMenuClick();
    haptics.select();
    beginDailyRun();
    dailyAvailable = false;
    await startSinglePlayer();
  }

  function hoursToReset(): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return Math.max(1, Math.round((next.getTime() - now.getTime()) / 3600000));
  }

  function openRecords() {
    playMenuClick();
    uiState.showRecords = true;
  }

  async function handleHost() {
    playMenuClick();
    await resumeAudioContext();
    hostRoom();
  }

  async function handleJoin() {
    if (!roomCodeInput.trim()) {
      showToast('Please enter a room code.');
      return;
    }
    playMenuClick();
    await resumeAudioContext();
    joinRoom(roomCodeInput.trim().toUpperCase());
  }

  function handleCancelMp() {
    playMenuClick();
    disconnectNetwork();
    showMpOptions = false;
  }

  // --- Party lobby helpers ---
  let lobbyMe = $derived(
    uiState.lobby.players.find((p) => p.connectionId === getLocalConnectionId()),
  );
  let allReady = $derived(
    uiState.lobby.players.length > 0 && uiState.lobby.players.every((p) => p.ready),
  );

  function toggleReady() {
    playMenuClick();
    haptics.select();
    setLobbyState({ ready: !(lobbyMe?.ready ?? false) });
  }

  function pickLobbyCharacter(charId: string) {
    if (!isCharacterUnlocked(charId)) {
      showToast('🔒 Character locked');
      return;
    }
    playMenuClick();
    saveLocal('geo_selected_character', JSON.stringify(charId));
    setLobbyState({ character: charId });
  }

  function handleStartParty() {
    playMenuClick();
    haptics.select();
    startPartyGame();
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(uiState.roomCode);
      showToast('Room code copied');
    } catch {
      showToast(uiState.roomCode);
    }
  }

  function openSettings() {
    playMenuClick();
    uiState.showSettings = true;
  }

  function saveName() {
    saveLocal('geo_player_name', uiState.playerName.trim());
  }

  /** Character color as a CSS hex string for per-card theming. */
  function charColor(c: number): string {
    return `#${c.toString(16).padStart(6, '0')}`;
  }
</script>

<div id="main-menu" class:hidden={uiState.gameState !== 'MENU'}>
  <!-- Ambient drifting glows: transform-only animation, GPU-composited -->
  <div class="ambient" aria-hidden="true">
    <div class="glow g1"></div>
    <div class="glow g2"></div>
  </div>

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

        <button class="btn daily" class:used={!dailyAvailable} onclick={handleDaily}>
          <span class="label">Daily Run</span>
          <span class="sub">
            {#if dailyAvailable}
              {getCharacter(dailyConfig.characterId).name} · CORRUPTION {dailyConfig.corruption}
            {:else}
              Done — best {dailyBest}
            {/if}
          </span>
        </button>

        <!-- Secondary destinations: compact two-column grid keeps the menu short -->
        <div class="menu-grid">
          <button class="btn compact" onclick={() => (showShop = true)}>
            <span class="label">Shop</span>
          </button>
          <button class="btn compact" onclick={openRecords}>
            <span class="label">Records</span>
          </button>
          <button class="btn compact" onclick={() => (uiState.showGrimoire = true)}>
            <span class="label">Evolutions</span>
          </button>
          <button class="btn compact" onclick={() => { playMenuClick(); showMpOptions = true; }}>
            <span class="label">Co-op</span>
          </button>
        </div>

        <button class="btn slim" onclick={openSettings}>
          <span class="label">Settings</span>
        </button>

        {#if uiState.canInstall}
          <button class="btn ghost slim" onclick={handleInstall}>
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
            oninput={() => saveLocal('geo_server_url', uiState.customServerUrl)}
          />
        </label>
      {:else if uiState.networkStatus === 'connecting'}
        <div class="status-panel">
          <div class="spinner"></div>
          <p class="status-heading">Connecting</p>
          <p class="status-detail">Pinging beacon…</p>
          <button class="btn ghost danger" onclick={handleCancelMp}>
            <span class="label">Abort</span>
          </button>
        </div>
      {:else if uiState.networkStatus === 'in_lobby'}
        <!-- PARTY LOBBY: roster, ready-up, character pick, host start -->
        <div class="lobby-panel">
          <button class="code-box clickable" onclick={copyRoomCode} title="Copy room code">
            <p class="lobby-code tnum">{uiState.roomCode}</p>
            <span class="copy-hint">TAP TO COPY · SHARE WITH FRIENDS</span>
          </button>

          <div class="lobby-roster">
            {#each uiState.lobby.players as p (p.connectionId)}
              {@const ch = getCharacter(p.character)}
              <div class="lobby-row" class:ready={p.ready}>
                <span class="lobby-char">{ch.icon}</span>
                <span class="lobby-name"
                  >{p.name}{#if p.isHost}<span class="host-tag">HOST</span>{/if}</span
                >
                <span class="lobby-ready">{p.ready ? '✓ READY' : '· · ·'}</span>
              </div>
            {/each}
            {#each Array(Math.max(0, 4 - uiState.lobby.players.length)) as _, i (i)}
              <div class="lobby-row empty"><span class="lobby-name">— open slot —</span></div>
            {/each}
          </div>

          <!-- Own character pick (unlocked roster only) -->
          <div class="lobby-chars">
            {#each CHARACTERS as char (char.id)}
              {@const locked = !isCharacterUnlocked(char.id)}
              <button
                class="lobby-char-btn"
                class:selected={lobbyMe?.character === char.id}
                class:locked
                title={char.name}
                style={locked ? undefined : `--char-color: ${charColor(char.color)}`}
                onclick={() => pickLobbyCharacter(char.id)}
              >
                {locked ? '🔒' : char.icon}
              </button>
            {/each}
          </div>

          {#if uiState.isHost}
            <button
              class="btn primary"
              disabled={!allReady || uiState.lobby.players.length < 2}
              onclick={handleStartParty}
            >
              <span class="label">START RUN</span>
              <span class="sub">
                {uiState.lobby.players.length < 2
                  ? 'Waiting for teammates…'
                  : allReady
                    ? `${uiState.lobby.players.length} fighters ready`
                    : 'Waiting for ready-up…'}
              </span>
            </button>
          {:else}
            <button class="btn primary" class:ghosted={lobbyMe?.ready} onclick={toggleReady}>
              <span class="label">{lobbyMe?.ready ? 'UNREADY' : 'READY UP'}</span>
              <span class="sub">Host starts when everyone is ready</span>
            </button>
          {/if}

          <button class="btn ghost danger" onclick={handleCancelMp}>
            <span class="label">Leave party</span>
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
              <button
                class="buy-btn"
                class:disabled={maxed || uiState.credits < cost}
                onclick={() => buyUpgrade(up.id)}
              >
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

      <!-- Corruption dial: 0-10, 5 = standard. Opt-in risk for opt-in reward. -->
      <div class="corruption-row">
        <div class="corruption-info">
          <span class="corruption-label">
            ☠️ CORRUPTION {uiState.corruption}
            <span
              class="corruption-tier"
              class:standard={uiState.corruption === 5}
              class:brutal={uiState.corruption > 5}
              class:relaxed={uiState.corruption < 5}
            >
              {corruptionTierName(uiState.corruption)}
            </span>
          </span>
          <span class="corruption-desc">
            {#if uiState.corruption === 0}
              The gentlest run — easy mode
            {:else}
              +{Math.round((corruptionHp(uiState.corruption) - 1) * 100)}% enemy HP{#if uiState.corruption > 5}
                · +{Math.round((corruptionDamage(uiState.corruption) - 1) * 100)}% damage · +{Math.round(
                  (corruptionSpeed(uiState.corruption) - 1) * 100,
                )}% speed{/if} · +{Math.round((corruptionXp(uiState.corruption) - 1) * 100)}% XP
            {/if}
          </span>
        </div>
        <div class="corruption-controls">
          <button
            class="corr-btn"
            onclick={() => setCorruption(-1)}
            disabled={uiState.corruption <= 0}>−</button
          >
          <button
            class="corr-btn"
            onclick={() => setCorruption(1)}
            disabled={uiState.corruption >= CORRUPTION_MAX}>+</button
          >
        </div>
      </div>

      <div class="char-grid">
        {#each CHARACTERS as char (char.id)}
          {@const locked = !isCharacterUnlocked(char.id)}
          {@const gate = locked ? getUnlockCondition('character', char.id) : null}
          <button
            class="char-card"
            class:locked
            style={locked ? undefined : `--char-color: ${charColor(char.color)}`}
            onclick={() => selectCharacter(char.id)}
          >
            {#if locked}
              <div class="char-icon">🔒</div>
              <h3 class="char-name">???</h3>
              <p class="char-weapon">LOCKED</p>
              <p class="char-desc">{gate ? gate.description : 'Keep playing to unlock.'}</p>
            {:else}
              <div class="char-icon">{char.icon}</div>
              <h3 class="char-name">{char.name}</h3>
              <p class="char-weapon">{char.weaponName}</p>
              <p class="char-desc">{char.description}</p>
              {#if char.quirk}
                <p class="char-quirk">★ {char.quirk}</p>
              {/if}
              <div class="char-stats">
                {#each char.statPreview as stat (stat)}
                  <span>{stat}</span>
                {/each}
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <button class="btn back-btn" onclick={() => (showCharacterSelect = false)}
        >Back to Menu</button
      >
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
    position: relative;
    z-index: 1;
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
    animation: word-glow 3.4s ease-in-out infinite;
  }
  @keyframes word-glow {
    0%,
    100% {
      text-shadow: 0 0 8px rgba(54, 230, 255, 0.12);
    }
    50% {
      text-shadow: 0 0 26px rgba(54, 230, 255, 0.42);
    }
  }
  .tagline {
    margin-top: 0.85rem;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.42em;
    text-indent: 0.42em;
    color: var(--color-text-dim);
  }
  /* Terminal cursor: little arcade wink after the tagline */
  .tagline::after {
    content: '_';
    color: var(--color-primary);
    animation: cursor-blink 1.2s steps(1) infinite;
  }
  @keyframes cursor-blink {
    50% {
      opacity: 0;
    }
  }

  /* ---- Ambient drifting glows ---- */
  .ambient {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .glow {
    position: absolute;
    width: 55vmax;
    height: 55vmax;
    border-radius: 50%;
    opacity: 0.07;
    filter: blur(60px);
    will-change: transform;
  }
  .g1 {
    background: radial-gradient(circle, var(--color-primary), transparent 65%);
    top: -20vmax;
    left: -12vmax;
    animation: drift1 26s ease-in-out infinite alternate;
  }
  .g2 {
    background: radial-gradient(circle, #ff3d77, transparent 65%);
    bottom: -22vmax;
    right: -14vmax;
    animation: drift2 32s ease-in-out infinite alternate;
  }
  @keyframes drift1 {
    from {
      transform: translate3d(0, 0, 0) scale(1);
    }
    to {
      transform: translate3d(9vmax, 6vmax, 0) scale(1.15);
    }
  }
  @keyframes drift2 {
    from {
      transform: translate3d(0, 0, 0) scale(1.1);
    }
    to {
      transform: translate3d(-8vmax, -5vmax, 0) scale(0.95);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow,
    .wordmark .accent,
    .tagline::after {
      animation: none;
    }
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
    transform: translateY(-1.5px);
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

  /* Secondary destinations packed two-up */
  .menu-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
  }
  .btn.compact {
    justify-content: center;
    padding: 0.8rem 0.5rem;
  }
  .btn.compact .label {
    font-size: 0.82rem;
  }

  .btn.compact.soon {
    position: relative;
    cursor: not-allowed;
    opacity: 0.55;
  }
  .btn.compact.soon:hover {
    background: rgba(255, 255, 255, 0.035);
    border-color: var(--color-border);
    transform: none;
  }
  .soon-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 0.46rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #04060f;
    background: var(--color-gold, #ffd75e);
    padding: 0.15rem 0.35rem;
    border-radius: 999px;
    line-height: 1;
  }

  /* Tertiary rows (settings/install) stay quiet */
  .btn.slim {
    justify-content: center;
    padding: 0.6rem;
    background: transparent;
  }
  .btn.slim .label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text-dim);
  }
  .btn.slim:hover .label {
    color: var(--color-text-main);
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

  /* ---- Party lobby ---- */
  .lobby-panel {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .code-box.clickable {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    background: rgba(54, 230, 255, 0.06);
    border: 1px solid var(--color-border-bright);
    border-radius: var(--r-md);
    padding: 0.7rem 1.5rem;
    text-align: center;
  }
  .code-box.clickable:hover {
    background: rgba(54, 230, 255, 0.12);
  }
  .copy-hint {
    font-size: 0.52rem;
    letter-spacing: 0.12em;
    color: var(--color-text-dim);
  }
  .lobby-roster {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .lobby-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.8rem;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 0.75rem;
  }
  .lobby-row.ready {
    border-color: rgba(0, 255, 136, 0.35);
  }
  .lobby-row.empty {
    opacity: 0.35;
    justify-content: center;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
  }
  .lobby-char {
    font-size: 1rem;
  }
  .lobby-name {
    flex: 1;
    font-weight: 700;
    color: var(--color-text-main);
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .host-tag {
    font-size: 0.5rem;
    letter-spacing: 0.12em;
    color: var(--color-primary);
    border: 1px solid var(--color-border-bright);
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
  }
  .lobby-ready {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-text-dim);
  }
  .lobby-row.ready .lobby-ready {
    color: #00ff88;
  }
  .lobby-chars {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .lobby-char-btn {
    all: unset;
    cursor: pointer;
    --char-color: var(--color-primary);
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.05rem;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: all var(--transition-fast);
  }
  .lobby-char-btn:hover:not(.locked) {
    border-color: var(--char-color);
    transform: translateY(-1px);
  }
  .lobby-char-btn.selected {
    border-color: var(--char-color);
    background: rgba(54, 230, 255, 0.12);
    box-shadow: 0 0 14px -5px var(--char-color);
  }
  .lobby-char-btn.locked {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn.primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: none;
  }
  .btn.primary.ghosted {
    filter: saturate(0.4) brightness(0.85);
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
  /* Two columns on phones, four on wide screens — cards stay card-shaped
     instead of stretching into full-width slabs or 8-up slivers. */
  .char-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.7rem;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
  }

  .char-card {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    /* Each card carries its character's color for hover glow + accents */
    --char-color: var(--color-primary);
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--color-border);
    border-radius: var(--r-md);
    padding: 0.95rem 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.35rem;
    transition: all var(--transition-fast);
  }
  .char-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: var(--char-color);
    box-shadow:
      inset 0 0 0 1px var(--char-color),
      0 0 24px -8px var(--char-color);
    transform: translateY(-2px);
  }
  .char-card:active {
    transform: scale(0.99);
  }

  .char-icon {
    font-size: 1.6rem;
    filter: drop-shadow(0 0 7px var(--char-color));
    transition: transform var(--transition-smooth);
  }
  .char-card:hover .char-icon {
    transform: scale(1.18) rotate(-4deg);
  }

  .char-name {
    font-family: var(--font-heading);
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: var(--color-text-main);
    margin: 0;
  }

  .char-weapon {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--char-color, var(--color-primary));
    margin: 0;
  }

  .char-desc {
    font-size: 0.62rem;
    color: var(--color-text-dim);
    margin: 0;
    line-height: 1.35;
  }

  .char-stats {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 600;
    color: var(--color-text-dim);
    margin-top: 0.3rem;
  }

  .char-stats span {
    background: rgba(255, 255, 255, 0.04);
    padding: 0.15rem 0.4rem;
    border-radius: var(--r-sm);
  }

  .char-card.locked {
    opacity: 0.55;
    filter: grayscale(0.6);
  }

  .char-card.locked:hover {
    border-color: var(--color-border);
    box-shadow: none;
  }

  .char-quirk {
    font-size: 0.62rem;
    font-weight: 700;
    color: #ffd75e;
    margin: 0;
  }

  /* --- Corruption dial --- */
  .corruption-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--r-md);
    border: 1px solid rgba(255, 61, 119, 0.35);
    background: rgba(255, 61, 119, 0.05);
    margin: 0 auto 0.8rem;
    width: 100%;
    max-width: 560px;
  }

  @media (min-width: 720px) {
    .corruption-row {
      max-width: 780px;
    }
  }

  .corruption-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-align: left;
  }

  .corruption-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #ff3d77;
  }

  .corruption-tier {
    margin-left: 0.35rem;
    padding: 0.05rem 0.35rem;
    border-radius: var(--r-pill);
    font-size: 0.5rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    vertical-align: middle;
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text-dim);
  }
  /* Below standard reads calm; standard is the confident default; brutal burns. */
  .corruption-tier.relaxed {
    background: rgba(56, 245, 168, 0.14);
    color: #38f5a8;
  }
  .corruption-tier.standard {
    background: rgba(54, 230, 255, 0.16);
    color: #36e6ff;
  }
  .corruption-tier.brutal {
    background: rgba(255, 61, 119, 0.18);
    color: #ff3d77;
  }

  .corruption-desc {
    font-size: 0.58rem;
    color: var(--color-text-dim);
    line-height: 1.4;
  }

  .corruption-controls {
    display: flex;
    gap: 0.35rem;
  }

  .corr-btn {
    all: unset;
    cursor: pointer;
    width: 1.9rem;
    height: 1.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    border: 1px solid var(--color-border);
    font-size: 1rem;
    font-weight: 800;
    color: var(--color-text-main);
    transition: all var(--transition-fast);
  }

  .corr-btn:hover:not(:disabled) {
    border-color: #ff3d77;
    color: #ff3d77;
  }

  .corr-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* --- Daily run button accent --- */
  .btn.daily {
    border-color: rgba(255, 215, 94, 0.4);
  }

  .btn.daily .label {
    color: #ffd75e;
  }

  .btn.daily.used {
    opacity: 0.6;
  }

  /* Wide screens: four cards per row */
  @media (min-width: 720px) {
    .char-grid {
      grid-template-columns: repeat(4, 1fr);
      max-width: 780px;
    }
  }
</style>
