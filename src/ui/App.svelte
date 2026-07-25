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
  import HowToPlayModal from './modals/HowToPlayModal.svelte';
  import TutorialCoach from './TutorialCoach.svelte';
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

  <!-- Teaching layer: the one-time briefing, the always-available reference,
       and the contextual tips that introduce each system the first time it
       actually shows up in a run. -->
  <Onboarding />
  <HowToPlayModal />
  {#if !uiState.dive}
    <TutorialCoach />
  {/if}

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

  /* The UI layer is click-through by default so the HUD never eats a tap
     meant for the arena. Everything genuinely interactive opts back in
     here, centrally — the old `button, input` allowlist meant any control
     that wasn't literally one of those two tags (a role=button card, a
     label, a scroll container) silently became dead, and each modal had to
     remember its own `pointer-events: auto` band-aid.

     Scroll containers are included deliberately: a `.menu-scroll` with
     pointer-events:none cannot be dragged, which reads as "the menu is
     frozen" on a phone. */
  .game-ui :global(button),
  .game-ui :global(input),
  .game-ui :global(select),
  .game-ui :global(textarea),
  .game-ui :global(a[href]),
  .game-ui :global(label),
  .game-ui :global([role='button']),
  .game-ui :global([role='tab']),
  .game-ui :global([role='slider']),
  .game-ui :global([role='dialog']),
  .game-ui :global([tabindex]:not([tabindex='-1'])),
  .game-ui :global(.menu-scroll),
  .game-ui :global(.rail-scroll),
  .game-ui :global(.interactive) {
    pointer-events: auto;
  }
</style>
