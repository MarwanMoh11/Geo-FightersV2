<script lang="ts">
  import HUD from './HUD.svelte';
  import Inventory from './Inventory.svelte';
  import MainMenu from './MainMenu.svelte';
  import SettingsModal from './modals/SettingsModal.svelte';
  import PauseModal from './modals/PauseModal.svelte';
  import UpgradeModal from './modals/UpgradeModal.svelte';
  import GameOverModal from './modals/GameOverModal.svelte';
  import SecondChanceModal from './modals/SecondChanceModal.svelte';
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
  import DiveHUD from './DiveHUD.svelte';
  import { uiState } from '../core/UIState.svelte.ts';
</script>

<div class="game-ui">
  <MainMenu />
  <!-- The dive is a self-contained sub-scene with its own HUD. The arena
       overlays (run timer, XP bar, combo, weapon rack, wayfinding) describe a
       world that is frozen off-screen, so leaving them mounted stacked two
       unrelated HUDs on top of each other. MobileControls stays: the dive
       reads the same virtual joystick. -->
  {#if !uiState.dive}
    <HUD />
    <Inventory />
  {/if}
  <MobileControls />

  <!-- Phase 1.96 JACK IN: mounted per-breach so the mini-game captures its
       config at init; the world keeps simulating underneath -->
  {#if uiState.breach}
    <BreachOverlay />
  {/if}

  <!-- Breach dive HUD: pure-DOM overlay shown while a dive is active.
       Mounted at the same level as BreachOverlay so it stacks with the
       rest of the UI modals. -->
  {#if uiState.dive}
    <DiveHUD />
  {/if}

  <PauseModal />
  <SettingsModal />
  <UpgradeModal />
  <SecondChanceModal />
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
