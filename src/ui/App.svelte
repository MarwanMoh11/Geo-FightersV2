<script lang="ts">
  import HUD from './HUD.svelte';
  import Inventory from './Inventory.svelte';
  import MainMenu from './MainMenu.svelte';
  import SettingsModal from './modals/SettingsModal.svelte';
  import PauseModal from './modals/PauseModal.svelte';
  import UpgradeModal from './modals/UpgradeModal.svelte';
  import GameOverModal from './modals/GameOverModal.svelte';
  import MobileControls from './MobileControls.svelte';
  import { uiState } from '../core/UIState.svelte.ts';
</script>

<div class="game-ui">
  <MainMenu />
  <HUD />
  <Inventory />
  <MobileControls />

  <PauseModal />
  <SettingsModal />
  <UpgradeModal />
  <GameOverModal />
</div>

<style>
  .game-ui {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 100;
  }

  .game-ui :global(button) {
    pointer-events: auto;
  }
</style>
