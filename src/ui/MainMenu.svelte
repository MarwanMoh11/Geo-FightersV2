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
    corruptionCredits,
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
  import Modal from './Modal.svelte';
  import Slider from './controls/Slider.svelte';

  /** Which full-screen sub-panel is open. */
  let panel = $state<'none' | 'roster' | 'shop'>('none');
  let showMpOptions = $state(false);
  let roomCodeInput = $state('');

  /* The roster previews a fighter before committing, so a mis-tap can't
     drop you into a run with the wrong build. `focusedChar` is the preview;
     `uiState.selectedCharacter` only changes on START RUN. */
  let focusedChar = $state(uiState.selectedCharacter);

  const UPGRADES_LIST = [
    {
      id: 'might',
      name: 'Output Wattage',
      short: 'MIGHT',
      icon: '⚔️',
      desc: '+10% damage output per level',
      max: 5,
      baseCost: 150,
      costScale: 2.0,
    },
    {
      id: 'maxHealth',
      name: 'Armor Shell',
      short: 'HP',
      icon: '❤️',
      desc: '+10 max HP per level',
      max: 5,
      baseCost: 100,
      costScale: 1.8,
    },
    {
      id: 'armor',
      name: 'Reinforced Core',
      short: 'ARMOR',
      icon: '🛡️',
      desc: '+1 damage reduction per level',
      max: 5,
      baseCost: 200,
      costScale: 2.2,
    },
    {
      id: 'moveSpeed',
      name: 'Overclocked Thrusters',
      short: 'SPEED',
      icon: '💨',
      desc: '+5% move speed per level',
      max: 5,
      baseCost: 120,
      costScale: 1.9,
    },
    {
      id: 'magnet',
      name: 'Tractor Beam',
      short: 'MAGNET',
      icon: '🧲',
      desc: '+20% pickup range per level',
      max: 5,
      baseCost: 80,
      costScale: 1.7,
    },
    {
      id: 'luck',
      name: 'Precision Luck',
      short: 'LUCK',
      icon: '🎲',
      desc: '+10% crit and rarity chance',
      max: 5,
      baseCost: 150,
      costScale: 2.0,
    },
    {
      id: 'rerolls',
      name: 'Defrag Reroll',
      short: 'REROLL',
      icon: '🔄',
      desc: '+1 level-up reroll per run',
      max: 3,
      baseCost: 200,
      costScale: 2.2,
    },
    {
      id: 'banishes',
      name: 'System Banish',
      short: 'BANISH',
      icon: '🚫',
      desc: '+1 level-up banish per run',
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
    if (uiState.credits < cost) {
      showToast(`Need ${cost - uiState.credits} more credits`);
      return;
    }
    uiState.credits -= cost;
    uiState.permanentUpgrades[upId] = currentLvl + 1;
    saveLocal('geo_credits', JSON.stringify(uiState.credits));
    saveLocal('geo_permanent_upgrades', JSON.stringify(uiState.permanentUpgrades));
    playMenuBuy();
    haptics.reward();
  }

  async function handleInstall() {
    playMenuClick();
    haptics.select();
    await promptInstall();
  }

  /* One tap to play: the primary CTA starts a run with the fighter and
     threat level already chosen. Depth lives behind the roster tile, so
     the fastest path to gameplay is never gated behind a config screen. */
  async function handlePlay() {
    playMenuClick();
    haptics.select();
    await startSinglePlayer();
  }

  function openRoster() {
    playMenuClick();
    haptics.select();
    focusedChar = uiState.selectedCharacter;
    panel = 'roster';
  }

  function focusCharacter(charId: string) {
    playMenuClick();
    haptics.select();
    focusedChar = charId;
  }

  async function confirmRoster() {
    if (!isCharacterUnlocked(focusedChar)) return;
    playMenuClick();
    haptics.select();
    uiState.selectedCharacter = focusedChar;
    saveLocal('geo_selected_character', JSON.stringify(focusedChar));
    panel = 'none';
    await startSinglePlayer();
  }

  async function startSinglePlayer() {
    await resumeAudioContext();
    uiState.isMultiplayer = false;
    uiState.isHost = false;
    setGameState('PLAYING');
  }

  // --- Corruption dial (0-10 risk/reward, 5 = standard, persisted) ---
  function setCorruption(next: number) {
    uiState.corruption = Math.max(0, Math.min(CORRUPTION_MAX, Math.round(next)));
    saveLocal('geo_corruption_v3', JSON.stringify(uiState.corruption));
  }

  let corruptionTone = $derived(
    uiState.corruption > 5 ? 'brutal' : uiState.corruption < 5 ? 'relaxed' : 'standard',
  );

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

  function openHowTo() {
    playMenuClick();
    haptics.select();
    uiState.showHowTo = true;
  }

  async function handleHost() {
    playMenuClick();
    await resumeAudioContext();
    hostRoom();
  }

  async function handleJoin() {
    if (!roomCodeInput.trim()) {
      showToast('Enter a 4-character room code first.');
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
      showToast('🔒 Locked — check Records for the unlock condition');
      return;
    }
    playMenuClick();
    haptics.select();
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
      showToast('Room code copied — send it to your squad');
    } catch {
      showToast(uiState.roomCode);
    }
  }

  function saveName() {
    saveLocal('geo_player_name', uiState.playerName.trim());
  }

  /** Character color as a CSS hex string for per-card theming. */
  function charColor(c: number): string {
    return `#${c.toString(16).padStart(6, '0')}`;
  }

  /* statPreview entries look like "HP: 120", "SPD: 115%", "Armor: +1".
     Absolute values get a bar against a 150 ceiling so builds are visually
     comparable; relative modifiers ("+1", "+25%") stay as plain readouts,
     because a bar would imply a scale they don't live on. */
  function parseStat(entry: string) {
    const [label, raw = ''] = entry.split(':').map((t) => t.trim());
    const num = parseFloat(raw);
    const relative = raw.startsWith('+') || raw.startsWith('-');
    const pct =
      !relative && Number.isFinite(num) ? Math.max(4, Math.min(100, (num / 150) * 100)) : null;
    return { label, raw, pct };
  }

  let focused = $derived(getCharacter(focusedChar));
  let focusedLocked = $derived(!isCharacterUnlocked(focusedChar));
  let focusedGate = $derived(focusedLocked ? getUnlockCondition('character', focusedChar) : null);
  let focusedGatePct = $derived(
    focusedGate
      ? Math.floor(Math.min(1, focusedGate.progress(getLifetimeStats()) / focusedGate.target) * 100)
      : 0,
  );
  let unlockedCount = $derived(CHARACTERS.filter((c) => isCharacterUnlocked(c.id)).length);
  let selectedName = $derived(getCharacter(uiState.selectedCharacter).name);
</script>

<div id="main-menu" class:hidden={uiState.gameState !== 'MENU'}>
  <!-- Ambient drifting glows: transform-only animation, GPU-composited -->
  <div class="ambient" aria-hidden="true">
    <div class="glow g1"></div>
    <div class="glow g2"></div>
    <div class="grid-floor"></div>
  </div>

  <div class="menu-viewport menu-scroll">
    <div class="menu-content">
      <!-- Status strip: everything persistent at a glance, above the fold -->
      <div class="status-strip">
        <span class="ui-chip gold" title="Credits earned across all runs">
          🪙 <span class="tnum">{uiState.credits}</span>
        </span>
        <span class="ui-chip" title="Fighters unlocked">
          👤 <span class="tnum">{unlockedCount}/{CHARACTERS.length}</span>
        </span>
        <span class="spacer"></span>
        <span class="ui-chip" class:green={dailyAvailable} title="Daily run availability">
          {dailyAvailable ? '● DAILY READY' : '○ DAILY DONE'}
        </span>
      </div>

      <div class="hero-split">
        <header class="brand">
          <h1 class="wordmark">GEO<span class="accent">FIGHTERS</span></h1>
          <div class="tagline">SURVIVE THE HORDE</div>
        </header>

        <div class="menu-actions">
          {#if !showMpOptions && uiState.networkStatus === 'disconnected'}
            <button class="play-cta" onclick={handlePlay}>
              <span class="play-glyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                </svg>
              </span>
              <span class="play-text">
                <span class="play-label">PLAY</span>
                <span class="play-sub tnum">{selectedName} · CORRUPTION {uiState.corruption}</span>
              </span>
            </button>

            <button class="ui-btn block daily" class:used={!dailyAvailable} onclick={handleDaily}>
              <span class="daily-dot" class:on={dailyAvailable} aria-hidden="true"></span>
              <span class="daily-text">
                <span class="daily-label">Daily Run</span>
                <span class="daily-sub">
                  {#if dailyAvailable}
                    {getCharacter(dailyConfig.characterId).name} · Corruption {dailyConfig.corruption}
                  {:else}
                    Best {dailyBest} · resets in {hoursToReset()}h
                  {/if}
                </span>
              </span>
            </button>

            <!-- Destination tiles: icon + label, big enough to hit blind -->
            <div class="tile-grid">
              <button class="tile" onclick={openRoster}>
                <span class="tile-icon" aria-hidden="true">🎖️</span>
                <span class="tile-label">Fighters</span>
                <span class="tile-meta tnum">{unlockedCount}/{CHARACTERS.length}</span>
              </button>
              <button
                class="tile"
                onclick={() => {
                  playMenuClick();
                  panel = 'shop';
                }}
              >
                <span class="tile-icon" aria-hidden="true">🛠️</span>
                <span class="tile-label">Upgrades</span>
                <span class="tile-meta tnum">🪙 {uiState.credits}</span>
              </button>
              <button class="tile" onclick={openRecords}>
                <span class="tile-icon" aria-hidden="true">🏆</span>
                <span class="tile-label">Records</span>
              </button>
              <button
                class="tile"
                onclick={() => {
                  playMenuClick();
                  uiState.showGrimoire = true;
                }}
              >
                <span class="tile-icon" aria-hidden="true">📖</span>
                <span class="tile-label">Evolutions</span>
              </button>
            </div>

            <button
              class="ui-btn block coop"
              onclick={() => {
                playMenuClick();
                showMpOptions = true;
              }}
            >
              <span aria-hidden="true">🌐</span> Play with friends
            </button>

            <div class="quiet-row">
              <button class="ui-btn quiet" onclick={openHowTo}>How to play</button>
              <button
                class="ui-btn quiet"
                onclick={() => {
                  playMenuClick();
                  uiState.showSettings = true;
                }}>Settings</button
              >
              {#if uiState.canInstall}
                <button class="ui-btn quiet install" onclick={handleInstall}>Install</button>
              {/if}
            </div>
          {:else if showMpOptions && uiState.networkStatus === 'disconnected'}
            <div class="mp-panel">
              <p class="mp-hint">
                Host a lobby and share the code, or join a friend's with theirs.
              </p>

              <label class="ui-field">
                <span class="eyebrow">Call sign</span>
                <input
                  type="text"
                  maxlength="12"
                  placeholder="PLAYER"
                  class="ui-input centered"
                  bind:value={uiState.playerName}
                  oninput={saveName}
                />
              </label>

              <button class="ui-btn primary lg block" onclick={handleHost}>Host a lobby</button>

              <div class="join-row">
                <input
                  type="text"
                  maxlength="4"
                  placeholder="CODE"
                  class="ui-input code-input tnum"
                  aria-label="Room code"
                  bind:value={roomCodeInput}
                />
                <button class="ui-btn join" onclick={handleJoin}>Join</button>
              </div>

              <details class="advanced">
                <summary>Advanced</summary>
                <label class="ui-field">
                  <span class="eyebrow">Signaling beacon</span>
                  <input
                    type="text"
                    placeholder="auto"
                    class="ui-input server-input"
                    bind:value={uiState.customServerUrl}
                    oninput={() => saveLocal('geo_server_url', uiState.customServerUrl)}
                  />
                </label>
              </details>

              <button class="ui-btn ghost block" onclick={handleCancelMp}>Back</button>
            </div>
          {:else if uiState.networkStatus === 'connecting'}
            <div class="status-panel">
              <div class="spinner"></div>
              <p class="status-heading">Connecting</p>
              <p class="status-detail">Pinging beacon…</p>
              <button class="ui-btn ghost danger block" onclick={handleCancelMp}>Abort</button>
            </div>
          {:else if uiState.networkStatus === 'in_lobby'}
            <!-- PARTY LOBBY: roster, ready-up, character pick, host start -->
            <div class="lobby-panel">
              <button class="code-box" onclick={copyRoomCode} title="Copy room code">
                <span class="eyebrow">Room code</span>
                <span class="lobby-code tnum">{uiState.roomCode}</span>
                <span class="copy-hint">TAP TO COPY · SHARE WITH FRIENDS</span>
              </button>

              <div class="lobby-roster">
                {#each uiState.lobby.players as p (p.connectionId)}
                  {@const ch = getCharacter(p.character)}
                  <div
                    class="lobby-row"
                    class:ready={p.ready}
                    style="--char-color: {charColor(ch.color)}"
                  >
                    <span class="lobby-char">{ch.icon}</span>
                    <span class="lobby-name">
                      {p.name}{#if p.isHost}<span class="host-tag">HOST</span>{/if}
                    </span>
                    <span class="lobby-ready">{p.ready ? '✓ READY' : '· · ·'}</span>
                  </div>
                {/each}
                {#each Array(Math.max(0, 4 - uiState.lobby.players.length)) as _, i (i)}
                  <div class="lobby-row empty"><span class="lobby-name">Open slot</span></div>
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
                    title={locked ? 'Locked' : char.name}
                    aria-label={locked ? 'Locked fighter' : char.name}
                    style={locked ? undefined : `--char-color: ${charColor(char.color)}`}
                    onclick={() => pickLobbyCharacter(char.id)}
                  >
                    {locked ? '🔒' : char.icon}
                  </button>
                {/each}
              </div>

              {#if uiState.isHost}
                <button
                  class="ui-btn primary lg block"
                  disabled={!allReady || uiState.lobby.players.length < 2}
                  onclick={handleStartParty}
                >
                  {uiState.lobby.players.length < 2
                    ? 'Waiting for teammates…'
                    : allReady
                      ? `Start run · ${uiState.lobby.players.length} ready`
                      : 'Waiting for ready-up…'}
                </button>
              {:else}
                <button
                  class="ui-btn lg block"
                  class:primary={!lobbyMe?.ready}
                  onclick={toggleReady}
                >
                  {lobbyMe?.ready ? 'Cancel ready' : 'Ready up'}
                </button>
              {/if}

              <button class="ui-btn ghost danger block" onclick={handleCancelMp}>Leave party</button
              >
            </div>
          {/if}
        </div>
      </div>

      <footer class="menu-footer">
        <span class="online">● ONLINE</span>
        <span class="version tnum">v{__APP_VERSION__}</span>
      </footer>
    </div>
  </div>

  <!-- ============================ ROSTER ============================ -->
  {#if panel === 'roster'}
    <Modal
      eyebrow="Deployment"
      title="Choose your fighter"
      subtitle="Each fighter changes your starting weapon and stat identity."
      size="lg"
      tone="cyan"
      onclose={() => (panel = 'none')}
    >
      {#snippet readout()}
        <span class="ui-chip cyan tnum">{unlockedCount}/{CHARACTERS.length}</span>
      {/snippet}

      <!-- Featured card: the fighter you're about to take in -->
      <div
        class="feature"
        class:locked={focusedLocked}
        style="--char-color: {charColor(focused.color)}"
      >
        <div class="feature-head">
          <div class="feature-avatar">{focusedLocked ? '🔒' : focused.icon}</div>
          <div class="feature-id">
            <h3 class="feature-name">{focusedLocked ? 'LOCKED' : focused.name}</h3>
            <p class="feature-weapon">{focusedLocked ? '???' : focused.weaponName}</p>
          </div>
        </div>

        {#if focusedLocked}
          <p class="feature-desc">{focusedGate?.description ?? 'Keep playing to unlock.'}</p>
          <div class="gate">
            <div class="ui-meter">
              <div class="ui-meter-fill gate-fill" style="width: {focusedGatePct}%"></div>
            </div>
            <span class="gate-pct tnum">{focusedGatePct}%</span>
          </div>
        {:else}
          <p class="feature-desc">{focused.description}</p>
          {#if focused.quirk}
            <p class="feature-quirk"><span aria-hidden="true">★</span> {focused.quirk}</p>
          {/if}
          <div class="stat-list">
            {#each focused.statPreview as entry (entry)}
              {@const s = parseStat(entry)}
              <div class="stat">
                <span class="stat-label">{s.label}</span>
                {#if s.pct !== null}
                  <div class="ui-meter stat-track">
                    <div class="ui-meter-fill stat-fill" style="width: {s.pct}%"></div>
                  </div>
                {:else}
                  <div class="stat-track spacer-track"></div>
                {/if}
                <span class="stat-val tnum">{s.raw}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Thumbnail rail: whole roster, one swipe -->
      <div class="rail rail-scroll" role="listbox" aria-label="Fighter roster">
        {#each CHARACTERS as char (char.id)}
          {@const locked = !isCharacterUnlocked(char.id)}
          <button
            class="thumb"
            class:active={focusedChar === char.id}
            class:locked
            role="option"
            aria-selected={focusedChar === char.id}
            aria-label={locked ? 'Locked fighter' : char.name}
            style="--char-color: {charColor(char.color)}"
            onclick={() => focusCharacter(char.id)}
          >
            <span class="thumb-icon">{locked ? '🔒' : char.icon}</span>
            <span class="thumb-name">{locked ? '???' : char.name}</span>
          </button>
        {/each}
      </div>

      <!-- Threat level -->
      <div class="corruption tone-{corruptionTone}">
        <Slider
          id="corruption-dial"
          label="Threat level"
          value={uiState.corruption}
          min={0}
          max={CORRUPTION_MAX}
          display={`${uiState.corruption} · ${corruptionTierName(uiState.corruption)}`}
          oninput={setCorruption}
        />
        <p class="corruption-desc">
          {#if uiState.corruption === 0}
            Level zero — the baseline run. Raise the dial for tougher enemies and far richer XP and
            credit payouts.
          {:else}
            +{Math.round((corruptionHp(uiState.corruption) - 1) * 100)}% enemy HP · +{Math.round(
              (corruptionXp(uiState.corruption) - 1) * 100,
            )}% XP · +{Math.round((corruptionCredits(uiState.corruption) - 1) * 100)}% credits{#if uiState.corruption > 5}
              · +{Math.round((corruptionDamage(uiState.corruption) - 1) * 100)}% enemy damage · +{Math.round(
                (corruptionSpeed(uiState.corruption) - 1) * 100,
              )}% enemy speed{/if}
          {/if}
        </p>
      </div>

      {#snippet footer()}
        <button class="ui-btn ghost back" onclick={() => (panel = 'none')}>Back</button>
        <button class="ui-btn primary lg deploy" disabled={focusedLocked} onclick={confirmRoster}>
          {focusedLocked ? 'Locked' : `Deploy ${focused.name}`}
        </button>
      {/snippet}
    </Modal>
  {/if}

  <!-- ============================= SHOP ============================= -->
  {#if panel === 'shop'}
    <Modal
      eyebrow="Permanent"
      title="Upgrades"
      subtitle="Bought once with credits, applied to every future run."
      size="lg"
      tone="gold"
      onclose={() => (panel = 'none')}
    >
      {#snippet readout()}
        <span class="ui-chip gold tnum">🪙 {uiState.credits}</span>
      {/snippet}

      <div class="shop-grid">
        {#each UPGRADES_LIST as up (up.id)}
          {@const level = uiState.permanentUpgrades[up.id] || 0}
          {@const cost = getUpgradeCost(up, level)}
          {@const maxed = level >= up.max}
          {@const affordable = uiState.credits >= cost}
          <div class="shop-card" class:maxed class:poor={!maxed && !affordable}>
            <!-- Progress wash: how far this line is built out -->
            <div
              class="shop-progress"
              style="width: {(level / up.max) * 100}%"
              aria-hidden="true"
            ></div>
            <div class="shop-body">
              <span class="shop-icon" aria-hidden="true">{up.icon}</span>
              <div class="shop-text">
                <h3 class="shop-name">{up.name}</h3>
                <p class="shop-desc">{up.desc}</p>
                <div class="shop-level">
                  <span class="ui-pips">
                    {#each Array(up.max) as _, i (i)}
                      <span class="ui-pip" class:on={i < level}></span>
                    {/each}
                  </span>
                  <span class="shop-lv tnum">LV {level}/{up.max}</span>
                </div>
              </div>
              <button
                class="ui-btn buy"
                class:can-buy={!maxed && affordable}
                disabled={maxed}
                onclick={() => buyUpgrade(up.id)}
              >
                {#if maxed}
                  MAX
                {:else}
                  <span class="tnum">🪙 {cost}</span>
                {/if}
              </button>
            </div>
          </div>
        {/each}
      </div>

      {#snippet footer()}
        <button class="ui-btn primary" onclick={() => (panel = 'none')}>Done</button>
      {/snippet}
    </Modal>
  {/if}
</div>

<style>
  #main-menu {
    position: fixed;
    inset: 0;
    z-index: var(--z-menu);
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(54, 230, 255, 0.09), transparent 70%),
      radial-gradient(ellipse 80% 50% at 50% 100%, rgba(255, 61, 119, 0.07), transparent 70%),
      var(--color-bg-dark);
    pointer-events: auto;
  }

  #main-menu.hidden {
    display: none;
  }

  /* The scroll column. Centring happens with `margin: auto` on the content
     inside a scrollable flex column, which — unlike `justify-content:center`
     — still lets you reach the top when the content is taller than the
     viewport. That combination previously clipped the wordmark and could
     push Play under the browser toolbar on short screens. */
  .menu-viewport {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--pad-top) var(--pad-right) var(--pad-bottom) var(--pad-left);
  }

  .menu-content {
    width: 100%;
    max-width: 24rem;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    animation: menu-in 0.6s var(--ease-out-expo) both;
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

  /* ---- Status strip ---- */
  .status-strip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .status-strip .spacer {
    flex: 1;
  }

  /* ---- Brand ---- */
  .brand {
    /* Container context so the wordmark can size itself against the column
       it actually lives in rather than the viewport — the two diverge hard
       once the desktop layout splits into brand + actions. */
    container-type: inline-size;
    text-align: center;
  }
  .wordmark {
    margin: 0;
    width: 100%;
    font-family: var(--font-heading);
    /* "FIGHTERS" measures ~6.1em wide in Orbitron 800, so a font-size of
       15cqw always leaves headroom inside the column. Sizing by vw instead
       let the word overflow (phones) or break mid-word into "FIGHTER / S"
       (desktop, where the column is far narrower than the window). */
    font-size: clamp(1.75rem, 13vw, 3.5rem);
    font-size: clamp(1.75rem, 15cqw, 3.5rem);
    font-weight: 800;
    letter-spacing: 0.04em;
    /* Compensate the trailing letter-spacing so centered text stays centered */
    text-indent: 0.04em;
    text-align: center;
    line-height: 0.92;
    color: var(--color-text-main);
    /* Last-resort guard if a fallback font measures much wider than Orbitron */
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
    font-size: var(--fs-micro);
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

  /* ---- Ambient background ---- */
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
  /* Perspective grid floor — sells the cyberspace setting without costing
     a single draw call on the game canvas. */
  .grid-floor {
    position: absolute;
    left: -25%;
    right: -25%;
    bottom: -10%;
    height: 55%;
    opacity: 0.16;
    background-image:
      linear-gradient(rgba(54, 230, 255, 0.5) 1px, transparent 1px),
      linear-gradient(90deg, rgba(54, 230, 255, 0.5) 1px, transparent 1px);
    background-size: 46px 46px;
    transform: perspective(340px) rotateX(66deg);
    transform-origin: bottom center;
    mask-image: linear-gradient(to top, #000 0%, transparent 78%);
    -webkit-mask-image: linear-gradient(to top, #000 0%, transparent 78%);
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

  /* ---- Actions ---- */
  .menu-actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* The one unmistakable focal point on the screen. */
  .play-cta {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-height: 68px;
    padding: 0.9rem 1.25rem;
    border-radius: var(--r-lg);
    background: linear-gradient(135deg, #5ff2ff, var(--color-primary) 55%, #17c7e6);
    color: #04060f;
    box-shadow:
      0 10px 34px -12px rgba(54, 230, 255, 0.95),
      inset 0 1px 0 rgba(255, 255, 255, 0.45);
    transition:
      transform var(--transition-fast),
      filter var(--transition-fast),
      box-shadow var(--transition-fast);
  }
  .play-cta:hover {
    filter: brightness(1.06);
    transform: translateY(-2px);
    box-shadow:
      0 16px 42px -12px rgba(54, 230, 255, 1),
      inset 0 1px 0 rgba(255, 255, 255, 0.45);
  }
  .play-cta:active {
    transform: scale(0.985);
  }
  .play-glyph {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(4, 6, 15, 0.16);
  }
  .play-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .play-label {
    font-family: var(--font-heading);
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
  }
  .play-sub {
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(4, 6, 15, 0.66);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- Daily ---- */
  .ui-btn.daily {
    justify-content: flex-start;
    gap: 0.7rem;
    padding: 0.7rem 1rem;
    border-color: rgba(255, 216, 77, 0.3);
    background: rgba(255, 216, 77, 0.05);
  }
  .ui-btn.daily.used {
    opacity: 0.6;
  }
  .daily-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-faint);
  }
  .daily-dot.on {
    background: var(--color-gold);
    box-shadow: 0 0 10px var(--color-gold);
    animation: text-pulse 2s ease-in-out infinite;
  }
  @keyframes text-pulse {
    50% {
      opacity: 0.5;
    }
  }
  .daily-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    min-width: 0;
  }
  .daily-label {
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-gold);
  }
  .daily-sub {
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
  }

  /* ---- Tiles ---- */
  .tile-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .tile {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    min-height: 78px;
    padding: 0.7rem 0.85rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }
  .tile:hover {
    background: var(--surface-3);
    border-color: var(--color-border-bright);
    transform: translateY(-2px);
  }
  .tile:active {
    transform: scale(0.98);
  }
  .tile-icon {
    font-size: 1.25rem;
    line-height: 1.1;
  }
  .tile-label {
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .tile-meta {
    font-size: var(--fs-micro);
    font-weight: 600;
    color: var(--color-text-dim);
  }

  .ui-btn.coop {
    justify-content: center;
    gap: 0.5rem;
  }

  .quiet-row {
    display: flex;
    gap: 0.25rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .quiet-row .ui-btn {
    flex: 1;
    min-width: 6rem;
    font-size: var(--fs-caption);
  }
  .ui-btn.quiet.install {
    color: var(--color-accent);
  }

  /* ---- Multiplayer ---- */
  .mp-panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .mp-hint {
    margin: 0;
    font-size: var(--fs-caption);
    line-height: 1.5;
    color: var(--color-text-dim);
    text-align: center;
  }
  .ui-input.centered {
    text-align: center;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .join-row {
    display: flex;
    gap: 0.5rem;
  }
  .code-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-primary);
    text-align: center;
    letter-spacing: 0.3em;
    text-indent: 0.3em;
    text-transform: uppercase;
  }
  .ui-btn.join {
    flex: 0 0 auto;
    padding: 0 1.4rem;
  }
  .advanced {
    border-top: 1px solid var(--color-border);
    padding-top: 0.6rem;
  }
  .advanced summary {
    cursor: pointer;
    font-size: var(--fs-caption);
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-dim);
    padding: 0.5rem 0;
    list-style: none;
  }
  .advanced summary::-webkit-details-marker {
    display: none;
  }
  .advanced summary::before {
    content: '▸ ';
    color: var(--color-primary);
  }
  .advanced[open] summary::before {
    content: '▾ ';
  }
  .server-input {
    font-family: var(--font-mono);
    font-size: var(--fs-caption);
    text-align: center;
  }

  /* ---- Connection status ---- */
  .status-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
  }
  .status-heading {
    margin: 0;
    font-size: var(--fs-heading);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .status-detail {
    margin: 0;
    font-size: var(--fs-caption);
    letter-spacing: 0.1em;
    color: var(--color-text-dim);
  }
  .status-panel .ui-btn {
    width: 100%;
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

  /* ---- Party lobby ---- */
  .lobby-panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .code-box {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.8rem 1.5rem;
    background: rgba(54, 230, 255, 0.07);
    border: 1px solid var(--color-border-bright);
    border-radius: var(--r-lg);
    text-align: center;
    transition: background var(--transition-fast);
  }
  .code-box:hover {
    background: rgba(54, 230, 255, 0.14);
  }
  .lobby-code {
    font-size: 2.1rem;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: 0.25em;
    text-indent: 0.25em;
    color: var(--color-primary);
  }
  .copy-hint {
    font-size: var(--fs-micro);
    letter-spacing: 0.12em;
    color: var(--color-text-dim);
  }
  .lobby-roster {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .lobby-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0.4rem 0.7rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--char-color, var(--color-border));
    font-size: var(--fs-caption);
  }
  .lobby-row.ready {
    border-color: rgba(56, 245, 168, 0.4);
    border-left-color: var(--color-accent);
    background: rgba(56, 245, 168, 0.06);
  }
  .lobby-row.empty {
    opacity: 0.4;
    justify-content: center;
    border-left-color: transparent;
    border-style: dashed;
  }
  .lobby-char {
    font-size: 1.05rem;
  }
  .lobby-name {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    color: var(--color-text-main);
    display: flex;
    align-items: center;
    gap: 0.45rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .host-tag {
    flex: 0 0 auto;
    font-size: var(--fs-micro);
    letter-spacing: 0.12em;
    color: var(--color-primary);
    border: 1px solid var(--color-border-bright);
    border-radius: 4px;
    padding: 0.1rem 0.3rem;
  }
  .lobby-ready {
    flex: 0 0 auto;
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-text-dim);
  }
  .lobby-row.ready .lobby-ready {
    color: var(--color-accent);
  }
  .lobby-chars {
    display: flex;
    gap: 0.35rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .lobby-char-btn {
    all: unset;
    cursor: pointer;
    --char-color: var(--color-primary);
    width: var(--tap);
    height: var(--tap);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    transition:
      border-color var(--transition-fast),
      transform var(--transition-fast),
      background var(--transition-fast);
  }
  .lobby-char-btn:hover:not(.locked) {
    border-color: var(--char-color);
    transform: translateY(-1px);
  }
  .lobby-char-btn.selected {
    border-color: var(--char-color);
    background: rgba(54, 230, 255, 0.14);
    box-shadow: 0 0 14px -5px var(--char-color);
  }
  .lobby-char-btn.locked {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ---- Footer ---- */
  .menu-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--color-text-faint);
  }
  .online {
    color: var(--color-accent);
  }

  /* ================= ROSTER PANEL ================= */
  .feature {
    --char-color: var(--color-primary);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1rem;
    border-radius: var(--r-lg);
    background:
      radial-gradient(ellipse 70% 90% at 12% 0%, rgba(255, 255, 255, 0.07), transparent 70%),
      var(--surface-2);
    border: 1px solid var(--color-border);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  }
  .feature::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    box-shadow: inset 0 0 28px -14px var(--char-color);
  }
  .feature.locked {
    filter: grayscale(0.7);
  }
  .feature-head {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }
  .feature-avatar {
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    font-size: 1.9rem;
    border-radius: var(--r-md);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--char-color);
    box-shadow: 0 0 22px -10px var(--char-color);
  }
  .feature-id {
    min-width: 0;
  }
  .feature-name {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--color-text-main);
  }
  .feature-weapon {
    margin: 0.1rem 0 0;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--char-color);
  }
  .feature-desc {
    margin: 0;
    font-size: var(--fs-caption);
    line-height: 1.5;
    color: var(--color-text-dim);
  }
  .feature-quirk {
    margin: 0;
    font-size: var(--fs-caption);
    font-weight: 700;
    line-height: 1.4;
    color: var(--color-gold);
  }
  .gate {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .gate .ui-meter {
    flex: 1;
  }
  .gate-fill {
    background: linear-gradient(90deg, #8a6b1f, var(--color-gold));
  }
  .gate-pct {
    font-size: var(--fs-micro);
    font-weight: 700;
    color: var(--color-gold);
  }

  .stat-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .stat {
    display: grid;
    grid-template-columns: 4.5rem 1fr 3.2rem;
    align-items: center;
    gap: 0.6rem;
  }
  .stat-label {
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .stat-track {
    height: 6px;
  }
  .spacer-track {
    border-radius: var(--r-pill);
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.08) 0 4px,
      transparent 4px 8px
    );
  }
  .stat-fill {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--char-color) 45%, #000),
      var(--char-color)
    );
  }
  .stat-val {
    font-size: var(--fs-micro);
    font-weight: 700;
    text-align: right;
    color: var(--color-text-main);
  }

  /* Thumbnail rail */
  .rail {
    display: flex;
    gap: 0.5rem;
    margin: 0.85rem -0.2rem 0;
    padding: 0.2rem;
  }
  .thumb {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    --char-color: var(--color-primary);
    flex: 0 0 auto;
    width: 74px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.55rem 0.3rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      transform var(--transition-fast);
  }
  .thumb:hover {
    transform: translateY(-2px);
    border-color: var(--char-color);
  }
  .thumb.active {
    border-color: var(--char-color);
    background: rgba(255, 255, 255, 0.07);
    box-shadow: 0 0 18px -8px var(--char-color);
  }
  .thumb.locked {
    opacity: 0.5;
  }
  .thumb-icon {
    font-size: 1.4rem;
    line-height: 1.1;
  }
  .thumb-name {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .thumb.active .thumb-name {
    color: var(--color-text-main);
  }

  /* Threat level */
  .corruption {
    margin-top: 1rem;
    padding: 0.85rem 1rem;
    border-radius: var(--r-md);
    border: 1px solid var(--tier-color);
    background: color-mix(in srgb, var(--tier-color) 7%, transparent);
    --tier-color: var(--color-primary);
  }
  .corruption.tone-relaxed {
    --tier-color: var(--color-accent);
  }
  .corruption.tone-standard {
    --tier-color: var(--color-primary);
  }
  .corruption.tone-brutal {
    --tier-color: var(--color-secondary);
  }
  .corruption-desc {
    margin: 0.5rem 0 0;
    font-size: var(--fs-micro);
    line-height: 1.55;
    color: var(--color-text-dim);
  }

  /* The confirm action carries more weight than the escape hatch, so it
     takes twice the footer width instead of splitting it 50/50. */
  .ui-btn.back {
    flex: 1;
  }
  .ui-btn.deploy {
    flex: 2;
  }

  /* ================= SHOP PANEL ================= */
  .shop-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .shop-card {
    position: relative;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }
  .shop-card:hover {
    border-color: rgba(255, 255, 255, 0.18);
  }
  /* Progress wash reads build-out at a glance, before any text is parsed */
  .shop-progress {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, rgba(54, 230, 255, 0.14), rgba(54, 230, 255, 0.03));
    transition: width var(--transition-smooth);
  }
  .shop-card.maxed {
    border-color: rgba(56, 245, 168, 0.35);
  }
  .shop-card.maxed .shop-progress {
    background: linear-gradient(90deg, rgba(56, 245, 168, 0.16), rgba(56, 245, 168, 0.04));
  }
  .shop-card.poor {
    opacity: 0.72;
  }
  .shop-body {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
  }
  .shop-icon {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    font-size: 1.15rem;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.05);
  }
  .shop-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .shop-name {
    margin: 0;
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .shop-desc {
    margin: 0;
    font-size: var(--fs-micro);
    line-height: 1.35;
    color: var(--color-text-dim);
  }
  .shop-level {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.15rem;
  }
  .shop-card.maxed .ui-pip.on {
    background: var(--color-accent);
    box-shadow: 0 0 6px rgba(56, 245, 168, 0.8);
  }
  .shop-lv {
    font-size: var(--fs-micro);
    color: var(--color-text-faint);
  }
  .ui-btn.buy {
    flex: 0 0 auto;
    min-width: 5.2rem;
    padding: 0.6rem 0.7rem;
    font-family: var(--font-mono);
    font-size: var(--fs-caption);
  }
  .ui-btn.buy.can-buy {
    background: rgba(255, 216, 77, 0.14);
    border-color: rgba(255, 216, 77, 0.45);
    color: var(--color-gold);
  }
  .ui-btn.buy.can-buy:hover {
    background: rgba(255, 216, 77, 0.24);
  }
  .shop-card.maxed .ui-btn.buy {
    background: rgba(56, 245, 168, 0.1);
    border-color: rgba(56, 245, 168, 0.3);
    color: var(--color-accent);
    opacity: 1;
  }

  /* ================= RESPONSIVE ================= */

  /* Desktop: the brand and the actions sit side by side, so the wordmark
     gets to be big and the button stack stays in one comfortable reading
     column instead of stretching across the whole window. */
  @media (min-width: 900px) and (min-height: 560px) {
    .menu-content {
      max-width: 62rem;
      gap: 2rem;
    }
    .hero-split {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      align-items: center;
      gap: 3.5rem;
    }
    .brand {
      text-align: left;
    }
    .wordmark {
      font-size: clamp(2.5rem, 15cqw, 5.5rem);
      text-align: left;
      text-indent: 0;
    }
    .tagline {
      margin-top: 1.2rem;
      font-size: 0.72rem;
    }
    .menu-actions {
      max-width: 26rem;
      width: 100%;
      justify-self: end;
    }
    .play-cta {
      min-height: 78px;
    }
    .play-label {
      font-size: 1.6rem;
    }
  }

  /* Short viewports (landscape phones, small laptop windows): shrink the
     hero so Play stays above the fold. */
  @media (max-height: 560px) {
    .menu-content {
      gap: 1rem;
    }
    .wordmark {
      font-size: clamp(1.6rem, 12cqw, 2.4rem);
    }
    .tagline {
      margin-top: 0.4rem;
      font-size: 0.55rem;
      letter-spacing: 0.3em;
      text-indent: 0.3em;
    }
    .play-cta {
      min-height: 58px;
    }
    .tile {
      min-height: 62px;
    }
  }

  /* Landscape phone: side-by-side is the only way the whole menu fits in
     ~360px of height. Brand left, actions right, nothing below the fold. */
  @media (max-height: 560px) and (min-width: 680px) {
    .menu-content {
      max-width: 52rem;
    }
    .hero-split {
      display: grid;
      grid-template-columns: 0.9fr 1.1fr;
      align-items: center;
      gap: 2rem;
    }
    .brand {
      text-align: left;
    }
    .wordmark {
      text-align: left;
      text-indent: 0;
      font-size: clamp(1.9rem, 14cqw, 3rem);
    }
    .tile-grid {
      grid-template-columns: repeat(4, 1fr);
    }
    .tile {
      min-height: 56px;
      align-items: center;
      text-align: center;
    }
    .tile-meta {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow,
    .wordmark .accent,
    .tagline::after,
    .daily-dot.on {
      animation: none;
    }
  }
</style>
