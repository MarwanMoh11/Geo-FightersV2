<script lang="ts">
  import { onMount } from 'svelte';
  import { updateVirtualJoystick, resetVirtualJoystick } from '../systems/InputSystem';
  import { uiState } from '../core/UIState.svelte.ts';
  import { haptics } from '../core/haptics';

  function onAttackStart() {
    haptics.select();
    updateVirtualJoystick(0, 0, true);
  }

  // let joystickZone: HTMLElement; // Unused in this version as we bind events to div directly
  let joyCenterX = $state(0);
  let joyCenterY = $state(0);
  let knobX = $state(0);
  let knobY = $state(0);
  let isDragging = $state(false);
  let touchId: number | null = null;
  // Scale the stick throw with screen size: tiny on phones, roomier on tablets
  let maxRadius = 50;

  function computeMaxRadius() {
    return Math.min(70, Math.max(44, window.innerWidth * 0.07));
  }

  function handleStart(e: TouchEvent | MouseEvent) {
    if (touchId !== null) return;
    maxRadius = computeMaxRadius();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if ('touches' in e) touchId = e.touches[0].identifier;

    joyCenterX = clientX;
    joyCenterY = clientY;
    isDragging = true;

    updatePos(clientX, clientY);
  }

  function handleMove(e: TouchEvent | MouseEvent) {
    if (!isDragging) return;

    let clientX, clientY;
    if ('touches' in e) {
      const touch = Array.from(e.changedTouches).find((t) => t.identifier === touchId);
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    updatePos(clientX, clientY);
  }

  function handleEnd(e: TouchEvent | MouseEvent) {
    if (!isDragging) return;

    if ('touches' in e) {
      const touch = Array.from(e.changedTouches).find((t) => t.identifier === touchId);
      if (!touch) return;
    }

    isDragging = false;
    touchId = null;
    knobX = 0;
    knobY = 0;
    resetVirtualJoystick();
  }

  function updatePos(x: number, y: number) {
    const dx = x - joyCenterX;
    const dy = y - joyCenterY;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxRadius);
    const angle = Math.atan2(dy, dx);

    knobX = Math.cos(angle) * distance;
    knobY = Math.sin(angle) * distance;

    updateVirtualJoystick(knobX / maxRadius, knobY / maxRadius);
  }

  onMount(() => {
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mobile-controls-layer" class:active={uiState.gameState === 'PLAYING'}>
  <!-- Interaction Zone -->
  <div
    class="joystick-zone"
    ontouchstart={handleStart}
    ontouchmove={handleMove}
    ontouchend={handleEnd}
    ontouchcancel={handleEnd}
    onmousedown={handleStart}
  >
    {#if isDragging}
      <div class="joystick-base" style="left: {joyCenterX}px; top: {joyCenterY}px;">
        <div class="joystick-knob" style="transform: translate({knobX}px, {knobY}px);"></div>
      </div>
    {/if}
  </div>

  <!-- Action Buttons -->
  <div class="action-buttons">
    <button
      class="action-btn attack"
      aria-label="Attack"
      ontouchstart={onAttackStart}
      ontouchend={() => updateVirtualJoystick(0, 0, false)}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />
      </svg>
    </button>
  </div>
</div>

<style>
  .mobile-controls-layer {
    position: fixed;
    inset: 0;
    z-index: 80;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .mobile-controls-layer.active {
    opacity: 1;
  }

  .joystick-zone {
    position: absolute;
    left: 0;
    bottom: 0;
    top: auto;
    width: 50%;
    height: 75%;
    pointer-events: auto;
  }

  /* Inverted controls: move the steering zone to the right edge */
  :global(body.inverted-controls) .joystick-zone {
    left: auto;
    right: 0;
  }

  .joystick-base {
    position: fixed;
    width: 116px;
    height: 116px;
    margin-left: -58px;
    margin-top: -58px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(4px);
  }

  .joystick-knob {
    width: 48px;
    height: 48px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }

  .action-buttons {
    position: absolute;
    bottom: calc(2rem + var(--safe-bottom));
    right: calc(2rem + var(--safe-right));
    display: flex;
    gap: 1rem;
    pointer-events: auto;
  }

  /* Inverted controls: move the attack button to the left edge */
  :global(body.inverted-controls) .action-buttons {
    right: auto;
    left: calc(2rem + var(--safe-left));
  }

  .action-btn {
    all: unset;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    color: var(--color-primary);
    background: rgba(54, 230, 255, 0.06);
    border: 1.5px solid rgba(54, 230, 255, 0.4);
  }

  .action-btn:active {
    transform: scale(0.92);
    background: rgba(54, 230, 255, 0.22);
  }

  /* Desktop Hide */
  @media (pointer: fine) {
    .mobile-controls-layer {
      display: none;
    }
  }
</style>
