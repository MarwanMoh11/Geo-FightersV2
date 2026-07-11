<script lang="ts">
  import HUD from './HUD.svelte';
  import Inventory from './Inventory.svelte';
  import MainMenu from './MainMenu.svelte';
  import SettingsModal from './modals/SettingsModal.svelte';
  import PauseModal from './modals/PauseModal.svelte';
  import UpgradeModal from './modals/UpgradeModal.svelte';
  import GameOverModal from './modals/GameOverModal.svelte';
  import GrimoireModal from './modals/GrimoireModal.svelte';
  import ProtocolModal from './modals/ProtocolModal.svelte';
  import ChestCeremonyModal from './modals/ChestCeremonyModal.svelte';
  import VictoryChoiceModal from './modals/VictoryChoiceModal.svelte';
  import RecordsModal from './modals/RecordsModal.svelte';
  import MobileControls from './MobileControls.svelte';
  import Onboarding from './Onboarding.svelte';
  import FPSCounter from './FPSCounter.svelte';
  import PwaLayer from './PwaLayer.svelte';
  import Toast from './Toast.svelte';
  import BreachOverlay from './BreachOverlay.svelte';
  import { uiState } from '../core/UIState.svelte.ts';
</script>

<div class="game-ui">
  <MainMenu />
  <HUD />
  <Inventory />
  <MobileControls />

  <!-- Phase 1.96 JACK IN: mounted per-breach so the mini-game captures its
       config at init; the world keeps simulating underneath -->
  {#if uiState.breach}
    <BreachOverlay />
  {/if}

  <PauseModal />
  <SettingsModal />
  <UpgradeModal />
  <GameOverModal />
  <GrimoireModal />
  <ProtocolModal />
  <ChestCeremonyModal />
  <VictoryChoiceModal />
  <RecordsModal />

  <Onboarding />

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
