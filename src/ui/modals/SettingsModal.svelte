<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { fade, scale } from 'svelte/transition';
  import {
    getSettings,
    setSetting,
    resetSettings,
    type GameSettings,
  } from '../../core/SettingsManager';

  let settings = $state(getSettings());

  function updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    setSetting(key, value);
    settings = getSettings(); // Sync local state
  }

  function close() {
    uiState.showSettings = false;
  }

  function reset() {
    resetSettings();
    settings = getSettings();
  }
</script>

{#if uiState.showSettings}
  <div id="settings-modal" transition:fade={{ duration: 200 }}>
    <div class="modal-overlay"></div>

    <div class="settings-content glass" transition:scale={{ duration: 250, start: 0.94 }}>
      <div class="header">
        <h2 class="title">CONFIGURATION</h2>
        <div class="tabs">
          <button
            class="tab-btn"
            class:active={uiState.activeSettingsTab === 'audio'}
            onclick={() => (uiState.activeSettingsTab = 'audio')}>AUDIO</button
          >
          <button
            class="tab-btn"
            class:active={uiState.activeSettingsTab === 'display'}
            onclick={() => (uiState.activeSettingsTab = 'display')}>DISPLAY</button
          >
          <button
            class="tab-btn"
            class:active={uiState.activeSettingsTab === 'gameplay'}
            onclick={() => (uiState.activeSettingsTab = 'gameplay')}>GAMEPLAY</button
          >
        </div>
      </div>

      <div class="scroll-area">
        {#if uiState.activeSettingsTab === 'audio'}
          <div class="panel">
            <div class="setting-item">
              <div class="info">
                <label for="masterVol">MASTER VOLUME</label>
                <span class="val">{settings.masterVolume}%</span>
              </div>
              <input
                id="masterVol"
                type="range"
                min="0"
                max="100"
                value={settings.masterVolume}
                oninput={(e) => updateSetting('masterVolume', parseInt(e.currentTarget.value))}
              />
            </div>
            <div class="setting-item">
              <div class="info">
                <label for="musicVol">MUSIC VOLUME</label>
                <span class="val">{settings.musicVolume}%</span>
              </div>
              <input
                id="musicVol"
                type="range"
                min="0"
                max="100"
                value={settings.musicVolume}
                oninput={(e) => updateSetting('musicVolume', parseInt(e.currentTarget.value))}
              />
            </div>
            <div class="setting-item">
              <div class="info">
                <label for="musicToggle">MUSIC ENABLED</label>
              </div>
              <button
                id="musicToggle"
                class="toggle"
                class:checked={settings.musicEnabled}
                onclick={() => updateSetting('musicEnabled', !settings.musicEnabled)}
                aria-label="Toggle Music"
              >
                <div class="thumb"></div>
              </button>
            </div>
          </div>
        {:else if uiState.activeSettingsTab === 'display'}
          <div class="panel">
            <div class="setting-item">
              <div class="info">
                <label for="shakeToggle">SCREEN SHAKE</label>
              </div>
              <button
                id="shakeToggle"
                class="toggle"
                class:checked={settings.screenShake}
                onclick={() => updateSetting('screenShake', !settings.screenShake)}
                aria-label="Toggle Screen Shake"
              >
                <div class="thumb"></div>
              </button>
            </div>
            <div class="setting-item">
              <div class="info">
                <label for="fpsToggle">SHOW FPS</label>
              </div>
              <button
                id="fpsToggle"
                class="toggle"
                class:checked={settings.showFps}
                onclick={() => updateSetting('showFps', !settings.showFps)}
                aria-label="Toggle FPS Counter"
              >
                <div class="thumb"></div>
              </button>
            </div>
          </div>
        {:else if uiState.activeSettingsTab === 'gameplay'}
          <div class="panel">
            <div class="setting-item">
              <div class="info">
                <label for="dmgNumToggle">DAMAGE NUMBERS</label>
              </div>
              <button
                id="dmgNumToggle"
                class="toggle"
                class:checked={settings.showDamageNumbers}
                onclick={() => updateSetting('showDamageNumbers', !settings.showDamageNumbers)}
                aria-label="Toggle Damage Numbers"
              >
                <div class="thumb"></div>
              </button>
            </div>
            <div class="setting-item">
              <div class="info">
                <label for="sens">JOYSTICK SENSITIVITY</label>
                <span class="val">{settings.joystickSensitivity}%</span>
              </div>
              <input
                id="sens"
                type="range"
                min="25"
                max="150"
                value={settings.joystickSensitivity}
                oninput={(e) =>
                  updateSetting('joystickSensitivity', parseInt(e.currentTarget.value))}
              />
            </div>
            <div class="setting-item">
              <div class="info">
                <label for="invertToggle">INVERT CONTROLS (L/R)</label>
              </div>
              <button
                id="invertToggle"
                class="toggle"
                class:checked={settings.invertControls}
                onclick={() => updateSetting('invertControls', !settings.invertControls)}
                aria-label="Toggle Inverse Controls"
              >
                <div class="thumb"></div>
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div class="footer">
        <button class="footer-btn" onclick={reset}>RESET DEFAULTS</button>
        <button class="footer-btn primary" onclick={close}>CLOSE</button>
      </div>
    </div>
  </div>
{/if}

<style>
  #settings-modal {
    position: fixed;
    inset: 0;
    z-index: 2100;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(10, 10, 18, 0.4);
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }

  .modal-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.6) 100%);
  }

  .settings-content {
    width: min(90%, 450px);
    border-radius: 20px;
    padding: 2rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    text-align: center;
    margin: 0;
    color: var(--color-text-main);
  }

  .tabs {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.25rem;
    border-radius: 10px;
  }

  .tab-btn {
    all: unset;
    flex: 1;
    text-align: center;
    padding: 0.6rem;
    font-size: 0.65rem;
    font-family: var(--font-mono);
    letter-spacing: 0.1em;
    cursor: pointer;
    border-radius: 8px;
    transition: all var(--transition-smooth);
    color: var(--color-text-dim);
  }

  .tab-btn.active {
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-primary);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  }

  .scroll-area {
    min-height: 200px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .setting-item .info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .setting-item label {
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    color: var(--color-text-main);
  }

  .setting-item .val {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--color-primary);
  }

  /* Slider */
  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    outline: none;
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: var(--color-primary);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px var(--color-primary);
  }

  /* Toggle */
  .toggle {
    all: unset;
    width: 44px;
    height: 22px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 11px;
    position: relative;
    cursor: pointer;
    transition: background 0.3s ease;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .toggle.checked {
    background: var(--color-primary);
  }

  .toggle .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .toggle.checked .thumb {
    transform: translateX(22px);
  }

  .footer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .footer-btn {
    all: unset;
    cursor: pointer;
    text-align: center;
    padding: 1rem;
    border-radius: 12px;
    font-family: var(--font-heading);
    font-size: 0.9rem;
    font-weight: 700;
    transition: all var(--transition-fast);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .footer-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .footer-btn.primary {
    background: var(--color-primary);
    color: #000;
    border: none;
  }
</style>
