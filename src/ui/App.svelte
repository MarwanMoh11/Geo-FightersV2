<script lang="ts">
  import HUD from './HUD.svelte';
  import Inventory from './Inventory.svelte';
  import MainMenu from './MainMenu.svelte';
  import SettingsModal from './modals/SettingsModal.svelte';
  import PauseModal from './modals/PauseModal.svelte';
  import UpgradeModal from './modals/UpgradeModal.svelte';
  import GameOverModal from './modals/GameOverModal.svelte';
  import GrimoireModal from './modals/GrimoireModal.svelte';
  import MobileControls from './MobileControls.svelte';
  import FPSCounter from './FPSCounter.svelte';
  import PwaLayer from './PwaLayer.svelte';
  import Toast from './Toast.svelte';
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
  <GrimoireModal />

  <FPSCounter />
  <PwaLayer />
  <Toast />
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

  .game-ui :global(button),
  .game-ui :global(input) {
    pointer-events: auto;
  }
</style>
