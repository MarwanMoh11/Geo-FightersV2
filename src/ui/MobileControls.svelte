<script lang="ts">
  import { onMount } from 'svelte';
  import {
    updateVirtualJoystick,
    resetVirtualJoystick,
    triggerOverload,
  } from '../systems/InputSystem';
  import { uiState } from '../core/UIState.svelte.ts';

  const isTouchDevice =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // let joystickZone: HTMLElement; // Unused in this version as we bind events to div directly
  let joyCenterX = $state(0);
  let joyCenterY = $state(0);
  let knobX = $state(0);
  let knobY = $state(0);
  let isDragging = $state(false);
  let touchId: number | null = null;
  // Scale the stick throw with screen size: tiny on phones, roomier on tablets.
  // Reactive because the travel ring is drawn from it.
  let maxRadius = $state(50);

  function computeMaxRadius() {
    return Math.min(70, Math.max(44, window.innerWidth * 0.07));
  }

  function handleStart(e: TouchEvent | MouseEvent) {
    if (e.cancelable) e.preventDefault();
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
    if (e.cancelable) e.preventDefault();
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
    // Fixed origin: the stick stays planted where the touch began (a trailing
    // origin was tried and felt disorienting — reverted by design).
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
<!-- Steering layer stands down entirely during a breach: the mini-game owns
     every touch, and the fighter is parked at the terminal anyway. -->
<div
  class="mobile-controls-layer"
  class:active={uiState.gameState === 'PLAYING' && !uiState.breach}
>
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
      <!-- The ring is drawn at the real `maxRadius`, so "knob touching the
           edge" genuinely means full speed. It used to be a fixed 58px ring
           over a 44–70px throw, which made the stick read as unresponsive on
           small screens and over-sensitive on large ones. -->
      <div
        class="joystick-base"
        style="left: {joyCenterX}px; top: {joyCenterY}px; --joy-r: {maxRadius}px"
      >
        <div class="joystick-track"></div>
        <div class="joystick-knob" style="transform: translate({knobX}px, {knobY}px);"></div>
      </div>
    {/if}
  </div>

  <!-- Overload trigger: touch equivalent of SPACE. Only materializes when the
       ability is charged, so it never clutters the screen otherwise. -->
  {#if isTouchDevice && uiState.overloadCharge >= 100 && !uiState.overloadActive}
    <button
      class="overload-btn"
      ontouchstart={(e) => {
        e.preventDefault();
        triggerOverload();
      }}
      onclick={triggerOverload}
      aria-label="Activate Overclock"
    >
      <span class="overload-bolt" aria-hidden="true">⚡</span>
      <!-- Named, not just a glowing circle: a bare icon left first-time
           players guessing what the button in the corner does. -->
      <span class="overload-label">OVERCLOCK</span>
    </button>
  {/if}
</div>

<style>
  .mobile-controls-layer {
    position: fixed;
    inset: 0;
    z-index: var(--z-controls);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .mobile-controls-layer.active {
    opacity: 1;
  }
  /* An inactive layer must not eat touches — opacity 0 alone still leaves
     the full-screen zone interactive, which stole taps from overlays. */
  .mobile-controls-layer:not(.active) .joystick-zone {
    pointer-events: none;
  }

  /* Touch anywhere to steer: the whole screen is the joystick zone and the
     stick spawns under the finger. UI buttons (pause, overload, modals) live
     on higher layers, so they still win their taps. */
  .joystick-zone {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    z-index: 1;
    -webkit-user-select: none;
    user-select: none;
  }

  .joystick-base {
    position: fixed;
    width: calc(var(--joy-r) * 2);
    height: calc(var(--joy-r) * 2);
    margin-left: calc(var(--joy-r) * -1);
    margin-top: calc(var(--joy-r) * -1);
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
    animation: joy-in 0.16s var(--ease-out-expo);
  }
  @keyframes joy-in {
    from {
      opacity: 0;
      transform: scale(0.82);
    }
  }

  /* Travel ring — the outer edge is exactly max throw */
  .joystick-track {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    border: 1.5px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 0 22px rgba(54, 230, 255, 0.08);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .joystick-knob {
    position: relative;
    width: 46px;
    height: 46px;
    background: radial-gradient(circle at 34% 30%, #8df6ff, var(--color-primary) 62%, #12a7bd);
    border-radius: 50%;
    box-shadow:
      0 2px 12px rgba(0, 0, 0, 0.45),
      0 0 20px -4px rgba(54, 230, 255, 0.8);
  }

  /* --- Overload trigger (appears only when charged) --- */
  .overload-btn {
    all: unset;
    position: absolute;
    z-index: 2; /* above the full-screen steering zone */
    right: calc(1.1rem + var(--safe-right, 0px));
    bottom: calc(7.5rem + var(--safe-bottom, 0px));
    width: 4.2rem;
    height: 4.2rem;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: auto;
    cursor: pointer;
    background: radial-gradient(circle at 35% 30%, rgba(255, 200, 60, 0.35), rgba(20, 14, 2, 0.85));
    border: 2px solid #ffaa00;
    box-shadow:
      0 0 22px rgba(255, 170, 0, 0.55),
      inset 0 0 14px rgba(255, 170, 0, 0.3);
    animation: overload-throb 0.9s ease-in-out infinite;
    touch-action: manipulation;
  }

  /* Joystick zone on the right? Mirror the button to the left thumb. */
  :global(body.inverted-controls) .overload-btn {
    right: auto;
    left: calc(1.1rem + var(--safe-left, 0px));
  }

  .overload-btn:active {
    transform: scale(0.92);
  }

  .overload-btn {
    flex-direction: column;
    gap: 1px;
  }

  .overload-bolt {
    font-size: 1.55rem;
    line-height: 1;
    filter: drop-shadow(0 0 8px rgba(255, 170, 0, 0.9));
  }

  .overload-label {
    font-family: var(--font-mono);
    font-size: 0.42rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #ffd75e;
    text-shadow: 0 0 6px rgba(255, 170, 0, 0.8);
  }

  /* Glow-only throb — animating transform would jitter the tap target */
  @keyframes overload-throb {
    50% {
      box-shadow:
        0 0 38px rgba(255, 170, 0, 0.9),
        inset 0 0 22px rgba(255, 170, 0, 0.55);
      border-color: #ffd75e;
    }
  }

  /* Desktop Hide */
  @media (pointer: fine) {
    .mobile-controls-layer {
      display: none;
    }
  }
</style>
