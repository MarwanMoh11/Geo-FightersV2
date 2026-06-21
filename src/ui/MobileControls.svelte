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
      <div class="joystick-base glass" style="left: {joyCenterX}px; top: {joyCenterY}px;">
        <div class="joystick-knob" style="transform: translate({knobX}px, {knobY}px);"></div>
        <div class="joystick-ring"></div>
      </div>
    {/if}
  </div>

  <!-- Action Buttons -->
  <div class="action-buttons">
    <button
      class="action-btn glass attack"
      aria-label="Attack"
      ontouchstart={onAttackStart}
      ontouchend={() => updateVirtualJoystick(0, 0, false)}
    >
      <div class="icon">⚡</div>
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
    width: 120px;
    height: 120px;
    margin-left: -60px;
    margin-top: -60px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
    border: 1px solid rgba(45, 226, 230, 0.3);
  }

  .joystick-knob {
    width: 50px;
    height: 50px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 20px var(--color-primary);
    border: 3px solid rgba(255, 255, 255, 0.2);
  }

  .joystick-ring {
    position: absolute;
    inset: 10px;
    border: 1px dashed rgba(45, 226, 230, 0.2);
    border-radius: 50%;
    animation: rotate 10s linear infinite;
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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
    width: 88px;
    height: 88px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  .action-btn:active {
    transform: scale(0.9);
    background: rgba(45, 226, 230, 0.2);
  }

  .action-btn.attack .icon {
    font-size: 2rem;
    text-shadow: 0 0 10px var(--color-primary);
  }

  /* Desktop Hide */
  @media (pointer: fine) {
    .mobile-controls-layer {
      display: none;
    }
  }
</style>
