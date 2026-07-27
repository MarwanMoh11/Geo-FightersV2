<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import {
    getSettings,
    setSetting,
    resetSettings,
    type GameSettings,
  } from '../../core/SettingsManager';
  import Modal from '../Modal.svelte';
  import Toggle from '../controls/Toggle.svelte';
  import Segmented from '../controls/Segmented.svelte';
  import Slider from '../controls/Slider.svelte';
  import SettingRow from '../controls/SettingRow.svelte';

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

  const TABS = [
    { id: 'audio', label: 'Audio' },
    { id: 'display', label: 'Display' },
    { id: 'gameplay', label: 'Controls' },
  ] as const;

  const QUALITY_HINT: Record<string, string> = {
    auto: 'Adapts resolution automatically to keep the game smooth on any device.',
    low: 'Lowest detail — best for older or weaker devices.',
    medium: 'Balanced visuals and performance.',
    high: 'Maximum visuals — needs a capable device.',
  };

  const FPS_HINT: Record<number, string> = {
    30: 'Best battery life — good for long mobile sessions.',
    60: 'Smooth and efficient (recommended).',
    0: "Uncapped — uses your display's full refresh rate. Drains battery.",
  };

  const isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
</script>

<Modal
  open={uiState.showSettings}
  eyebrow="Configuration"
  title="Settings"
  size="md"
  tone="cyan"
  backdropClose
  onclose={close}
>
  <div class="ui-tabs" role="tablist" aria-label="Settings sections">
    {#each TABS as tab (tab.id)}
      <button
        class="ui-tab"
        role="tab"
        aria-selected={uiState.activeSettingsTab === tab.id}
        onclick={() => (uiState.activeSettingsTab = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-body">
    {#if uiState.activeSettingsTab === 'audio'}
      <SettingRow layout="stack">
        <Slider
          id="masterVol"
          label="Master volume"
          value={settings.masterVolume}
          display={`${settings.masterVolume}%`}
          oninput={(v) => updateSetting('masterVolume', v)}
        />
      </SettingRow>
      <SettingRow layout="stack">
        <Slider
          id="musicVol"
          label="Music volume"
          value={settings.musicVolume}
          display={`${settings.musicVolume}%`}
          oninput={(v) => updateSetting('musicVolume', v)}
        />
      </SettingRow>
      <SettingRow label="Music" hint="Turn the soundtrack off without muting effects.">
        <Toggle
          id="musicToggle"
          label="Music enabled"
          checked={settings.musicEnabled}
          onchange={(v) => updateSetting('musicEnabled', v)}
        />
      </SettingRow>
    {:else if uiState.activeSettingsTab === 'display'}
      <SettingRow
        label="Graphics quality"
        hint={QUALITY_HINT[settings.qualityLevel]}
        layout="stack"
      >
        <Segmented
          id="qualitySelect"
          label="Graphics quality"
          value={settings.qualityLevel}
          options={[
            { value: 'auto', label: 'AUTO' },
            { value: 'low', label: 'LOW' },
            { value: 'medium', label: 'MED' },
            { value: 'high', label: 'HIGH' },
          ]}
          onchange={(v) => updateSetting('qualityLevel', v as GameSettings['qualityLevel'])}
        />
      </SettingRow>
      <SettingRow label="Frame rate cap" hint={FPS_HINT[settings.fpsLimit]} layout="stack">
        <Segmented
          id="fpsLimitSelect"
          label="Frame rate cap"
          value={settings.fpsLimit}
          options={[
            { value: 30, label: '30' },
            { value: 60, label: '60' },
            { value: 0, label: 'MAX' },
          ]}
          onchange={(v) => updateSetting('fpsLimit', v as GameSettings['fpsLimit'])}
        />
      </SettingRow>
      <SettingRow label="Show FPS counter" hint="Live frame-rate readout in the corner.">
        <Toggle
          id="fpsToggle"
          label="Show FPS counter"
          checked={settings.showFps}
          onchange={(v) => updateSetting('showFps', v)}
        />
      </SettingRow>
    {:else if uiState.activeSettingsTab === 'gameplay'}
      <SettingRow label="Damage numbers" hint="Show the damage each hit deals.">
        <Toggle
          id="dmgNumToggle"
          label="Damage numbers"
          checked={settings.showDamageNumbers}
          onchange={(v) => updateSetting('showDamageNumbers', v)}
        />
      </SettingRow>

      {#if isTouch}
        <SettingRow layout="stack" hint="How far you drag to reach full speed.">
          <Slider
            id="sens"
            label="Joystick sensitivity"
            min={25}
            max={150}
            value={settings.joystickSensitivity}
            display={`${settings.joystickSensitivity}%`}
            oninput={(v) => updateSetting('joystickSensitivity', v)}
          />
        </SettingRow>
        <SettingRow
          label="Left-handed layout"
          hint="Moves the ability button to the left of the screen."
        >
          <Toggle
            id="invertToggle"
            label="Left-handed layout"
            checked={settings.invertControls}
            onchange={(v) => updateSetting('invertControls', v)}
          />
        </SettingRow>
      {:else}
        <!-- Keyboard players get the actual key map instead of touch options
             that do nothing on their device. -->
        <div class="keymap">
          <h3 class="keymap-title">Keyboard</h3>
          <div class="keymap-row">
            <span class="keys"
              ><kbd class="kbd">W</kbd><kbd class="kbd">A</kbd><kbd class="kbd">S</kbd><kbd
                class="kbd">D</kbd
              ></span
            >
            <span class="keymap-desc">Move (arrow keys also work)</span>
          </div>
          <div class="keymap-row">
            <span class="keys"><kbd class="kbd">SPACE</kbd></span>
            <span class="keymap-desc">Trigger Overclock when charged</span>
          </div>
          <div class="keymap-row">
            <span class="keys"><kbd class="kbd">E</kbd></span>
            <span class="keymap-desc">Interact — breach a node you're standing at</span>
          </div>
          <div class="keymap-row">
            <span class="keys"><kbd class="kbd">ESC</kbd></span>
            <span class="keymap-desc">Pause and resume</span>
          </div>
          <p class="keymap-note">Aiming and firing are automatic — you only steer.</p>
        </div>
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    <button class="ui-btn ghost" onclick={reset}>Reset defaults</button>
    <button class="ui-btn primary" onclick={close}>Done</button>
  {/snippet}
</Modal>

<style>
  .tab-body {
    margin-top: var(--sp-4);
    display: flex;
    flex-direction: column;
    /* A fixed floor stops the sheet resizing as you switch tabs, which
       otherwise makes the footer buttons jump under your thumb. */
    min-height: 15rem;
  }

  .keymap {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding-top: 0.4rem;
  }
  .keymap-title {
    margin: 0;
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .keymap-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .keys {
    flex: 0 0 8.5rem;
    display: flex;
    gap: 0.2rem;
  }
  .keymap-desc {
    font-size: var(--fs-caption);
    line-height: 1.4;
    color: var(--color-text-dim);
  }
  .keymap-note {
    margin: 0.3rem 0 0;
    font-size: var(--fs-caption);
    line-height: 1.5;
    color: var(--color-primary);
  }
</style>
