// --- BREACH SYSTEM (Phase 1.96: JACK IN) ---
// Every interactable building is an enterable node behind a glowing door.
// One universal grammar teaches itself: glowing door = stand in it = JACK IN.
//
// This module owns:
//   • the node registry (4 SUPPLY DEPOTs, ARMORY, DATA BANK, 3 RELAY TOWERs,
//     SUBSTATION, STASH DEN) and their door dressing — additive door quads,
//     ground rings, one merged power-line mesh, camera-facing holo-signs
//   • the door prompt (E = jack in, Q = OVERCLOCK ×2, F = SKELETON KEY)
//   • the breach lifecycle: the GridRunner mini-game itself lives in
//     BreachOverlay.svelte (pure DOM); it reports back via resolveBreach()
//   • rewards, fail lockouts, the ICE TRACER, and the defend-the-hacker
//     shield drain in co-op
//
// Performance: all dressing is static geometry built once (~10 small quads +
// rings, ~10 sprites, 1 merged strip mesh); the per-frame cost is one distance
// check across ~10 nodes and a handful of material opacity writes.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { world } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { spawnCredit, spawnEnemy, EnemyType } from '../core/factories';
import { spawnChest } from './ChestSystem';
import { handleEnemyDeath } from './CollisionSystem';
import { playChestOpen, playLevelUp, playMenuBuy } from '../core/audio';
import { haptics } from '../core/haptics';
import {
  grantShrineBuff,
  grantScavengerChip,
  setShrineReadyByKind,
  SHRINE_SPOTS,
  type ShrineKind,
} from './ShrineSystem';
import { upgradeRandomOwnedWeapon, flushDeferredLevelUps } from './UpgradeSystem';
import type { Poi } from './WayfindingSystem';

export type BreachKind = 'depot' | 'armory' | 'bank' | 'relay' | 'substation' | 'stashden';

interface NodeDef {
  id: string;
  kind: BreachKind;
  name: string;
  icon: string;
  color: number;
  /** Building center (sign anchor) */
  x: number;
  z: number;
  /** Sign height above ground */
  signY: number;
  /** Door trigger point (just outside the building face) */
  doorX: number;
  doorZ: number;
  /** Outward-facing unit direction of the door */
  dirX: number;
  dirZ: number;
  /** Door quad height */
  doorH: number;
  shrineKind?: ShrineKind;
}

interface BreachNode extends NodeDef {
  cooldown: number;
  doorMat: THREE.MeshBasicMaterial | null;
  ringMat: THREE.MeshBasicMaterial | null;
  sign: THREE.Sprite | null;
}

const DOOR_RADIUS = 3.2;
const COOLDOWN_WIN = 60;
const COOLDOWN_WIN_DEPOT = 45;
const COOLDOWN_FAIL = 20;
const COOLDOWN_ABORT = 5;

function buildNodeDefs(): NodeDef[] {
  const defs: NodeDef[] = [];

  // SUPPLY DEPOTS: the four courtyard vending machines (15w × 25d), doors
  // facing the open plaza. The gentle tutorial nodes.
  const depots = [
    { x: -50, z: 50, dx: 1, dz: 0 },
    { x: 250, z: 80, dx: -1, dz: 0 },
    { x: 180, z: 300, dx: 0, dz: -1 },
    { x: -80, z: 280, dx: 1, dz: 0 },
  ];
  depots.forEach((d, i) => {
    const half = d.dx !== 0 ? 7.5 : 12.5;
    defs.push({
      id: `depot_${i + 1}`,
      kind: 'depot',
      name: 'SUPPLY DEPOT',
      icon: '🛒',
      color: 0xffd75e,
      x: d.x,
      z: d.z,
      signY: 5.2,
      doorX: d.x + d.dx * (half + 1.2),
      doorZ: d.z + d.dz * (half + 1.2),
      dirX: d.dx,
      dirZ: d.dz,
      doorH: 2.6,
    });
  });

  // ARMORY: the watchtower (26×26, h22), door on the south face
  defs.push({
    id: 'armory',
    kind: 'armory',
    name: 'ARMORY',
    icon: '🔫',
    color: 0xff8c3a,
    x: -332,
    z: -368,
    signY: 14,
    doorX: -332,
    doorZ: -368 + 14.2,
    dirX: 0,
    dirZ: 1,
    doorH: 4,
  });

  // DATA BANK (24×18, h10), door south
  defs.push({
    id: 'databank',
    kind: 'bank',
    name: 'DATA BANK',
    icon: '🏦',
    color: 0xffcc33,
    x: 300,
    z: -230,
    signY: 12,
    doorX: 300,
    doorZ: -230 + 10.2,
    dirX: 0,
    dirZ: 1,
    doorH: 4,
  });

  // SUBSTATION (20×20, h8), door north
  defs.push({
    id: 'substation',
    kind: 'substation',
    name: 'SUBSTATION',
    icon: '🔌',
    color: 0x9dff57,
    x: -240,
    z: 330,
    signY: 10,
    doorX: -240,
    doorZ: 330 - 11.2,
    dirX: 0,
    dirZ: -1,
    doorH: 3.6,
  });

  // STASH DEN (18×18, h7), door west
  defs.push({
    id: 'stashden',
    kind: 'stashden',
    name: 'STASH DEN',
    icon: '🔒',
    color: 0xc46bff,
    x: 320,
    z: 280,
    signY: 9,
    doorX: 320 - 10.2,
    doorZ: 280,
    dirX: -1,
    dirZ: 0,
    doorH: 3.4,
  });

  // RELAY TOWERS: the three shrine structures; the "door" is a free-standing
  // holo-gate on the plaza side of the pillar.
  for (const s of SHRINE_SPOTS) {
    defs.push({
      id: `relay_${s.kind}`,
      kind: 'relay',
      name: s.name,
      icon: s.kind === 'fire' ? '⚡' : s.kind === 'armor' ? '🛡️' : '💨',
      color: s.color,
      x: s.x,
      z: s.z,
      signY: 6.4,
      doorX: s.x,
      doorZ: s.z + 3.4,
      dirX: 0,
      dirZ: 1,
      doorH: 3.2,
      shrineKind: s.kind,
    });
  }

  return defs;
}

const nodes: BreachNode[] = buildNodeDefs().map((d) => ({
  ...d,
  cooldown: 0,
  doorMat: null,
  ringMat: null,
  sign: null,
}));

let initialized = false;
let sceneRef: THREE.Scene | null = null;
let firstBreachDone = false;
let keysBound = false;

function isHostOrSolo(): boolean {
  return !uiState.isMultiplayer || uiState.isHost;
}

function cssColor(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Security ramps with run time; the very first breach of a run is a gimme. */
function computeSecurity(): number {
  if (!firstBreachDone) return 0;
  const t = uiState.gameTime;
  return t < 150 ? 1 : t < 330 ? 2 : 3;
}

// --- DRESSING ---

/** Holo-sign: icon + name on a rounded dark plate, camera-facing sprite. */
function makeSign(icon: string, name: string, color: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const css = cssColor(color);

  ctx.fillStyle = 'rgba(5, 11, 20, 0.82)';
  ctx.strokeStyle = css;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 14);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '40px sans-serif';
  ctx.fillText(icon, 44, 50);
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = css;
  ctx.shadowColor = css;
  ctx.shadowBlur = 10;
  ctx.fillText(name, (canvas.width + 52) / 2, 42);
  ctx.shadowBlur = 0;
  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('— JACK IN —', (canvas.width + 52) / 2, 72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(8.5, 2.4, 1);
  return sprite;
}

function initDressing(scene: THREE.Scene): void {
  const stripParts: THREE.BufferGeometry[] = [];
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();

  for (const node of nodes) {
    // Door quad: the universal "you can enter me" beacon
    const doorMat = new THREE.MeshBasicMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.4, node.doorH), doorMat);
    door.position.set(
      node.doorX - node.dirX * 0.7,
      node.doorH / 2 + 0.05,
      node.doorZ - node.dirZ * 0.7,
    );
    door.rotation.y = Math.atan2(node.dirX, node.dirZ);
    scene.add(door);
    node.doorMat = doorMat;

    // Ground ring at the trigger point (pulses while ready)
    const ringMat = new THREE.MeshBasicMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.8, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(node.doorX, 0.06, node.doorZ);
    scene.add(ring);
    node.ringMat = ringMat;

    // Holo-sign above the structure
    const sign = makeSign(node.icon, node.name, node.color);
    sign.position.set(node.x, node.signY, node.z);
    scene.add(sign);
    node.sign = sign;

    // Power line: an emissive strip running from the street to the door
    // (merged below into a single mesh with vertex colors)
    const len = 13;
    const strip = new THREE.BoxGeometry(0.5, 0.05, len).toNonIndexed();
    _m.makeRotationY(Math.atan2(node.dirX, node.dirZ));
    strip.applyMatrix4(_m);
    _m.makeTranslation(
      node.doorX + node.dirX * (len / 2 + 1),
      0.03,
      node.doorZ + node.dirZ * (len / 2 + 1),
    );
    strip.applyMatrix4(_m);
    _c.setHex(node.color);
    const count = strip.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      colors[v * 3] = _c.r;
      colors[v * 3 + 1] = _c.g;
      colors[v * 3 + 2] = _c.b;
    }
    strip.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    stripParts.push(strip);
  }

  const strips = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(stripParts),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(strips);
}

function setNodeReadyLook(node: BreachNode, ready: boolean): void {
  if (node.doorMat) node.doorMat.opacity = ready ? 0.8 : 0.1;
  if (node.ringMat) node.ringMat.opacity = ready ? 0.45 : 0.06;
  if (node.sign) node.sign.material.opacity = ready ? 1 : 0.3;
  if (node.shrineKind) setShrineReadyByKind(node.shrineKind, ready);
}

// --- POIS ---

/** Ready doors get wayfinding arrows; depots only signpost when nearby. */
export function getBreachPois(): Poi[] {
  const pois: Poi[] = [];
  for (const node of nodes) {
    if (node.cooldown > 0) continue;
    pois.push({
      x: node.doorX,
      z: node.doorZ,
      icon: node.icon,
      color: cssColor(node.color),
      maxDist: node.kind === 'depot' ? 90 : 999,
    });
  }
  return pois;
}

/** MapEventSystem's opening choreography points at the nearest ready relay. */
export function getReadyRelaySpots(): { x: number; z: number }[] {
  return nodes
    .filter((n) => n.kind === 'relay' && n.cooldown <= 0)
    .map((n) => ({ x: n.x, z: n.z }));
}

// --- BREACH LIFECYCLE ---

/** Open the mini-game for the prompted node (E key / prompt button). */
export function startBreach(overclock: boolean): void {
  const prompt = uiState.breachPrompt;
  if (!prompt || uiState.breach) return;
  // The world is frozen behind a modal — the prompt is stale; don't jack in
  // under an upgrade screen or the pause menu
  if (uiState.showUpgrade || uiState.isPaused || uiState.gameState !== 'PLAYING') return;
  const node = nodes.find((n) => n.id === prompt.nodeId);
  if (!node || node.cooldown > 0) return;

  firstBreachDone = true;
  uiState.breachPrompt = null;
  uiState.breachShield = 1;
  uiState.breach = {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    icon: node.icon,
    color: cssColor(node.color),
    security: prompt.security,
    overclock,
  };
  playMenuBuy();
  haptics.select();
}

/** SKELETON KEY: skip the mini-game, take the reward (F key / prompt button). */
export function useSkeletonKey(): void {
  const prompt = uiState.breachPrompt;
  if (!prompt || uiState.breach || uiState.skeletonKeys <= 0) return;
  if (uiState.showUpgrade || uiState.isPaused || uiState.gameState !== 'PLAYING') return;
  const node = nodes.find((n) => n.id === prompt.nodeId);
  if (!node || node.cooldown > 0 || !sceneRef) return;

  firstBreachDone = true;
  uiState.skeletonKeys--;
  uiState.breachPrompt = null;
  announce('SKELETON KEY — ICE BYPASSED');
  grantReward(node, false);
  node.cooldown = node.kind === 'depot' ? COOLDOWN_WIN_DEPOT : COOLDOWN_WIN;
  setNodeReadyLook(node, false);
}

/** The overlay (or the shield drain) reports how the breach ended. */
export function resolveBreach(outcome: 'win' | 'fail' | 'abort'): void {
  const breach = uiState.breach;
  if (!breach) return;
  const node = nodes.find((n) => n.id === breach.nodeId);
  uiState.breach = null;
  flushDeferredLevelUps();
  if (!node) return;

  if (outcome === 'win') {
    grantReward(node, breach.overclock);
    node.cooldown = node.kind === 'depot' ? COOLDOWN_WIN_DEPOT : COOLDOWN_WIN;
  } else if (outcome === 'fail') {
    node.cooldown = COOLDOWN_FAIL;
    announce('TRACE DETECTED — LOCKED OUT');
    haptics.hit();
    // High-stakes fails bite back: the ICE dispatches a hunter
    if (breach.security >= 3 || breach.overclock) spawnTracer(node);
  } else {
    node.cooldown = COOLDOWN_ABORT;
  }
  setNodeReadyLook(node, false);
}

function spawnTracer(node: BreachNode): void {
  if (!sceneRef) return;
  const tracer = spawnEnemy(
    sceneRef,
    node.doorX + node.dirX * 4,
    node.doorZ + node.dirZ * 4,
    EnemyType.WARDEN,
  );
  tracer.moveSpeed = (tracer.moveSpeed ?? 1.5) * 2.2;
  if (tracer.health) {
    tracer.health.max = Math.round(tracer.health.max * 1.4);
    tracer.health.current = tracer.health.max;
  }
  tracer.baseColor = 0xff2244;
  announce('ICE TRACER DEPLOYED — RUN');
}

function grantReward(node: BreachNode, overclock: boolean): void {
  const scene = sceneRef;
  const player = world.with('isLocalPlayer', 'position').first;
  if (!scene || !player) return;
  playChestOpen();
  haptics.reward();

  const dropX = node.doorX + node.dirX * 2.5;
  const dropZ = node.doorZ + node.dirZ * 2.5;

  switch (node.kind) {
    case 'depot': {
      const types = ['medkit', 'magnet', 'bomb'];
      const n = overclock ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        world.add({
          isPickup: true,
          pickupType: types[Math.floor(Math.random() * 3)],
          position: new THREE.Vector3(dropX + Math.cos(a) * 1.8, 0.8, dropZ + Math.sin(a) * 1.8),
          velocity: new THREE.Vector3(),
        });
      }
      const credits = overclock ? 14 : 7;
      for (let i = 0; i < credits; i++) {
        const a = (i / credits) * Math.PI * 2;
        spawnCredit(scene, dropX + Math.cos(a) * 3, dropZ + Math.sin(a) * 3, 3);
      }
      announce('DEPOT CRACKED — SUPPLIES DISPENSED');
      break;
    }
    case 'armory': {
      const first = upgradeRandomOwnedWeapon();
      const second = overclock ? upgradeRandomOwnedWeapon() : null;
      if (first) {
        announce(
          second
            ? `ARMORY: ${first} + ${second} UPGRADED`
            : `ARMORY: ${first.toUpperCase()} UPGRADED`,
        );
      } else {
        // Everything maxed — the armory pays out in kind instead
        spawnChest(scene, dropX, dropZ, 'epic');
        announce('ARMORY: ARSENAL MAXED — VAULT CHEST RELEASED');
      }
      break;
    }
    case 'bank': {
      spawnChest(scene, dropX, dropZ, overclock ? 'epic' : 'rare');
      const credits = overclock ? 20 : 10;
      for (let i = 0; i < credits; i++) {
        const a = (i / credits) * Math.PI * 2;
        spawnCredit(scene, dropX + Math.cos(a) * 3.2, dropZ + Math.sin(a) * 3.2, 4);
      }
      announce('DATA BANK DRAINED');
      break;
    }
    case 'relay': {
      if (node.shrineKind) grantShrineBuff(node.shrineKind, overclock ? 45 : 30);
      uiState.relaySlowTimer = overclock ? 12 : 8;
      break;
    }
    case 'substation': {
      const radius = overclock ? 65 : 45;
      const damage = overclock ? 140 : 80;
      empBlast(scene, node.doorX, node.doorZ, radius, damage);
      announce('SUBSTATION EMP — GRID PURGED');
      break;
    }
    case 'stashden': {
      if (grantScavengerChip(player)) {
        announce('SCAVENGER CHIP ACQUIRED — SLUMS EXCLUSIVE');
        playLevelUp();
      } else {
        spawnChest(scene, dropX, dropZ, 'epic');
        announce('STASH DEN LOOTED');
      }
      const credits = overclock ? 16 : 8;
      for (let i = 0; i < credits; i++) {
        const a = (i / credits) * Math.PI * 2;
        spawnCredit(scene, dropX + Math.cos(a) * 2.6, dropZ + Math.sin(a) * 2.6, 4);
      }
      break;
    }
  }
}

function empBlast(scene: THREE.Scene, x: number, z: number, radius: number, damage: number): void {
  // Expanding shock rings (same primitive as the LOGIC BOMB pickup)
  for (const [inner, life] of [
    [0.2, 0.55],
    [0.15, 0.75],
  ] as const) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9dff57,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner - 0.02, inner, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.3, z);
    scene.add(ring);
    world.add({
      isParticle: true,
      position: ring.position,
      velocity: new THREE.Vector3(),
      transform: ring,
      lifeTimer: 0,
      maxLife: life,
      ringGrow: radius / inner - 1,
    });
  }

  for (const enemy of [...world.with('isEnemy', 'position', 'health')]) {
    if (!enemy.health) continue;
    const dx = enemy.position.x - x;
    const dz = enemy.position.z - z;
    if (dx * dx + dz * dz > radius * radius) continue;
    enemy.health.current -= damage;
    enemy.stunTimer = 2.0;
    enemy.hitFlashTimer = 0.15;
    if (enemy.health.current <= 0) handleEnemyDeath(enemy, sceneRef!);
  }
}

// --- INPUT ---

function bindKeys(): void {
  if (keysBound || typeof window === 'undefined') return;
  keysBound = true;
  window.addEventListener('keydown', (e) => {
    if (!uiState.breachPrompt || uiState.breach || uiState.gameState !== 'PLAYING') return;
    if (e.code === 'KeyE') startBreach(false);
    else if (e.code === 'KeyQ') startBreach(true);
    else if (e.code === 'KeyF') useSkeletonKey();
  });
}

/** Debug (?debug console): drive the breach flow from automated tests. */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __breach: object }).__breach = {
    startBreach,
    resolveBreach,
    useSkeletonKey,
  };
}

// --- RESET ---

export function resetBreachSystem(): void {
  firstBreachDone = false;
  for (const node of nodes) {
    node.cooldown = 0;
    setNodeReadyLook(node, true);
  }
  uiState.breach = null;
  uiState.breachPrompt = null;
  uiState.breachShield = 1;
  uiState.skeletonKeys = 0;
  uiState.relaySlowTimer = 0;
}

// --- TICK ---

export function BreachSystem(dt: number, scene: THREE.Scene): void {
  if (!initialized) {
    initialized = true;
    sceneRef = scene;
    initDressing(scene);
    bindKeys();
  }

  if (uiState.relaySlowTimer > 0) uiState.relaySlowTimer -= dt;

  // Cooldowns + ready-ring pulse
  const now = performance.now() / 1000;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.cooldown > 0) {
      node.cooldown -= dt;
      if (node.cooldown <= 0) setNodeReadyLook(node, true);
    } else if (node.ringMat) {
      node.ringMat.opacity = 0.35 + 0.18 * Math.sin(now * 3 + i * 1.7);
    }
  }

  // Doors are decor for co-op clients this phase; breaching is host/solo
  if (!isHostOrSolo()) {
    if (uiState.breachPrompt) uiState.breachPrompt = null;
    return;
  }

  const player = world.with('isLocalPlayer', 'position', 'health').first;
  if (!player || !player.health || player.health.current <= 0) {
    if (uiState.breachPrompt) uiState.breachPrompt = null;
    return;
  }

  // Mid-breach upkeep: the fighter kneels at the terminal under a shield
  if (uiState.breach) {
    if (!uiState.isMultiplayer) {
      // Solo: shield holds — but the pile-up outside is real
      player.invulnTimer = Math.max(player.invulnTimer ?? 0, 0.3);
    } else {
      // Co-op defend-the-hacker: every enemy near the door eats the shield
      let near = 0;
      for (const enemy of world.with('isEnemy', 'position')) {
        const dx = enemy.position.x - player.position.x;
        const dz = enemy.position.z - player.position.z;
        if (dx * dx + dz * dz < 81) {
          near++;
          if (near >= 10) break;
        }
      }
      if (near > 0) uiState.breachShield -= near * 0.025 * dt;
      if (uiState.breachShield > 0) {
        player.invulnTimer = Math.max(player.invulnTimer ?? 0, 0.3);
      } else {
        announce('BREACH SHIELD DOWN — EJECTED');
        resolveBreach('abort');
      }
    }
    return;
  }

  // Door prompt: nearest ready node in range
  let best: BreachNode | null = null;
  let bestD = DOOR_RADIUS * DOOR_RADIUS;
  for (const node of nodes) {
    if (node.cooldown > 0) continue;
    const dx = player.position.x - node.doorX;
    const dz = player.position.z - node.doorZ;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }

  if (best) {
    const security = computeSecurity();
    const hasKey = uiState.skeletonKeys > 0;
    const p = uiState.breachPrompt;
    if (!p || p.nodeId !== best.id || p.security !== security || p.hasKey !== hasKey) {
      uiState.breachPrompt = {
        nodeId: best.id,
        name: best.name,
        icon: best.icon,
        color: cssColor(best.color),
        security,
        hasKey,
      };
    }
  } else if (uiState.breachPrompt) {
    uiState.breachPrompt = null;
  }
}
