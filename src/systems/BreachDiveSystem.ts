// --- BREACH DIVE SYSTEM (chunk2: the scene-transition spine) ---
// Owns the dive sub-scene that swaps in for the arena once a breach is WON.
// For THIS chunk this is a skeleton: it builds one generic dive scene, ticks
// a placeholder trace meter, renders the dive scene itself (bypassing the
// arena renderFrame), and exits via ESC. The actual per-building verbs, win/
// fail detection, ICE behaviours, and themed scenes land in later chunks.
//
// Lifecycle (this chunk):
//   resolveBreach('win')  -> enterDive(node, overclock, security)
//        builds dive scene, sets uiState.dive, parks the fighter
//   per frame while uiState.dive is set:
//        BreachDiveSystem(dt, ...) advances trace, renders diveScene, returns
//   ESC  -> exitDive('abort') -> completeBreachFail(node), dispose, restore
//   (TODO chunk3) verb win -> exitDive('win') -> completeBreachWin(node), dispose, restore

import * as THREE from 'three';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { buildGenericDiveScene, disposeDiveScene } from '../core/DiveScenes';
import { completeBreachWin, completeBreachFail, type BreachNode } from './BreachSystem';
import { resetVirtualJoystick } from './InputSystem';
import { haptics } from '../core/haptics';

// Minimal structural type for the raw renderer — both THREE.WebGLRenderer and
// three/webgpu WebGPURenderer expose render(scene, camera). Keeps this module
// free of an `any` and independent of which backend initRenderer picked.
type DiveRenderer = { render: (scene: THREE.Scene, camera: THREE.Camera) => void };

// TODO(chunk3): tune TRACE_RATE per verb + build on security; win/fail detection.
const TRACE_RATE = 4; // trace points per second
const TRACE_MAX = 100;

let diveScene: THREE.Scene | null = null;
let diveMeshes: THREE.Object3D[] = [];
// The node currently being dived into (kept module-level so the per-frame
// tick + exit handler can reach it without threading it through every call).
let diveNode: BreachNode | null = null;
let diveOverclock = false;
let keysBound = false;

/**
 * Enter a breach dive for the given (won) node. Builds the dive scene, sets
 * uiState.dive, and parks the fighter so the frozen outer-loop steering
 * cannot bleed through. Does NOT spawn enemies yet (chunk3).
 */
export function enterDive(node: BreachNode, overclock: boolean, security: number): void {
  if (uiState.dive) return; // already diving — defensive double-enter guard
  const built = buildGenericDiveScene();
  diveScene = built.scene;
  diveMeshes = built.meshes;
  diveNode = node;
  diveOverclock = overclock;
  resetVirtualJoystick();
  haptics.select();
  announce('DIVE INITIATED');
  uiState.dive = {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    icon: node.icon,
    color: '#' + node.color.toString(16).padStart(6, '0'),
    security,
    overclock,
    trace: 0,
    traceMax: TRACE_MAX,
    objectiveText: 'DIVE INITIATED',
  };
  bindKeys();
}

/**
 * Per-frame dive tick. Advances the placeholder trace meter, renders the dive
 * scene directly (bypassing the arena renderFrame/bloom pipeline), and
 * short-circuits the outer game loop. No-ops when no dive is active.
 *
 * TODO(chunk3): per-building verb state machines, trace->ambush scaling,
 *   win/fail detection, ICE behaviours. For this chunk ESC is the only exit.
 */
export function BreachDiveSystem(
  dt: number,
  _scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: DiveRenderer,
): void {
  const dive = uiState.dive;
  if (!dive || !diveScene) return;

  // Advance the placeholder trace meter (chunk3 will tie this to verbs).
  dive.trace = Math.min(dive.traceMax, dive.trace + dt * TRACE_RATE);

  // TODO(chunk3): verb win/fail detection goes here.
  //   if (verbGoalReached) exitDive('win');
  //   if (dive.trace >= dive.traceMax) exitDive('fail');

  // Render the dive scene directly (bypasses the arena bloom/renderFrame so
  // the dive renders flat — chunk5 adds its own transition FX pipeline).
  renderer.render(diveScene, camera);
}

/** Bind the ESC eject key once. Guarded so re-entry doesn't double-bind. */
function bindKeys(): void {
  if (keysBound || typeof window === 'undefined') return;
  keysBound = true;
  window.addEventListener('keydown', (e) => {
    if (!uiState.dive) return;
    if (e.code === 'Escape') exitDive('abort');
  });
}

/**
 * Exit the active dive and resolve it against the breach node.
 *
 * - 'win'  : the dive was completed — calls completeBreachWin (grantReward +
 *   cooldown + opened=true). TODO(chunk3) drives this.
 * - 'fail'/'abort' : for this chunk both call completeBreachFail (cooldown +
 *   announce). Chunk3/4 will rewire 'fail' to spawn an exit ambush.
 *
 * Then disposes the dive scene and restores the outer-world game loop by
 * clearing uiState.dive.
 */
export function exitDive(outcome: 'win' | 'fail' | 'abort'): void {
  const node = diveNode;
  const dive = uiState.dive;
  if (!dive || !node) {
    // Defensive: nothing to exit — still tear down any half-built state.
    teardownDiveScene();
    uiState.dive = null;
    return;
  }

  if (outcome === 'win') {
    completeBreachWin(node, diveOverclock);
  } else {
    // TODO(chunk3): rewire 'fail' to spawn an ambush at the dive exit.
    completeBreachFail(node);
  }

  teardownDiveScene();
  uiState.dive = null;
}

function teardownDiveScene(): void {
  if (diveScene) {
    disposeDiveScene(diveScene, diveMeshes);
    diveScene = null;
    diveMeshes = [];
  }
  diveNode = null;
  diveOverclock = false;
}

// Debug hook (?debug console): lets tests drive the dive spine without going
// through the breach overlay. Mirrors the __breach hook in BreachSystem.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __dive: object }).__dive = {
    enterDive,
    exitDive,
  };
}
