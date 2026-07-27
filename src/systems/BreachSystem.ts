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
import { resetVirtualJoystick } from './InputSystem';
import type { Poi } from './WayfindingSystem';
import { enterDive, ejectDive, resetBreachDiveSystem } from './BreachDiveSystem';
import {
  ROOTKIT_KINDS,
  qualifiesForRootkit,
  tryGrantRootkit,
  formatBehaviourTag,
} from '../core/ExploitRegistry';

export type BreachKind = 'depot' | 'armory' | 'bank' | 'relay' | 'substation' | 'stashden';

export interface DiveOutcome {
  overclock: boolean;
  security: number;
  trace: number;
  traceMax: number;
  elapsed: number;
  verb: BreachKind;
  /** 0..1 verb-specific payout bonus (the stash den's banked stack). */
  bonus: number;
}

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

export interface BreachNode extends NodeDef {
  cooldown: number;
  doorMat: THREE.MeshBasicMaterial | null;
  ringMat: THREE.MeshBasicMaterial | null;
  sign: THREE.Sprite | null;
  // Permanent "BREACHED" state — flipped true the moment a dive is WON on
  // this node (set by BreachDiveSystem's exit-win handler, NOT on entry).
  opened: boolean;
  /**
   * Co-op: connection id of the player currently jacked into this node, or ''
   * when free. Host-authoritative — two players must not dive the same node,
   * and everyone's door should read "IN USE" while a teammate is inside.
   */
  claimedBy: string;
  /** Display name of the claimer, for the door prompt / HUD. */
  claimedName: string;
}

const DOOR_RADIUS = 3.2;
const COOLDOWN_WIN = 60;
const COOLDOWN_WIN_DEPOT = 45;
const COOLDOWN_FAIL = 20;
const COOLDOWN_ABORT = 5;

function buildNodeDefs(): NodeDef[] {
  const defs: NodeDef[] = [];

  // Positions mirror THE PIT's LevelData obstacles — keep them in sync.

  // SUPPLY DEPOTS: the four wall-inset vending machines, doors facing the
  // arena. The gentle tutorial nodes.
  const depots = [
    { x: 0, z: -60, dx: 0, dz: 1, half: 2 }, // north wall, faces south
    { x: 0, z: 60, dx: 0, dz: -1, half: 2 }, // south wall, faces north
    { x: 60, z: 20, dx: -1, dz: 0, half: 2 }, // east wall, faces west
    { x: -60, z: -20, dx: 1, dz: 0, half: 2 }, // west wall, faces east
  ];
  depots.forEach((d, i) => {
    defs.push({
      id: `depot_${i + 1}`,
      kind: 'depot',
      name: 'SUPPLY DEPOT',
      icon: '🛒',
      color: 0xffd75e,
      x: d.x,
      z: d.z,
      signY: 6.4,
      doorX: d.x + d.dx * (d.half + 1.2),
      doorZ: d.z + d.dz * (d.half + 1.2),
      dirX: d.dx,
      dirZ: d.dz,
      doorH: 2.6,
    });
  });

  // ARMORY: NW corner bunker (16×16, h12), door on the south face
  defs.push({
    id: 'armory',
    kind: 'armory',
    name: 'ARMORY',
    icon: '🔫',
    color: 0xff8c3a,
    x: -52,
    z: -52,
    signY: 14,
    doorX: -52,
    doorZ: -52 + 9.2,
    dirX: 0,
    dirZ: 1,
    doorH: 4,
  });

  // DATA BANK: NE vault (16×14, h10), door south
  defs.push({
    id: 'databank',
    kind: 'bank',
    name: 'DATA BANK',
    icon: '🏦',
    color: 0xffcc33,
    x: 52,
    z: -52,
    signY: 12,
    doorX: 52,
    doorZ: -52 + 8.2,
    dirX: 0,
    dirZ: 1,
    doorH: 4,
  });

  // SUBSTATION: SW power block (14×14, h8), door north
  defs.push({
    id: 'substation',
    kind: 'substation',
    name: 'SUBSTATION',
    icon: '🔌',
    color: 0x9dff57,
    x: -52,
    z: 52,
    signY: 10,
    doorX: -52,
    doorZ: 52 - 8.2,
    dirX: 0,
    dirZ: -1,
    doorH: 3.6,
  });

  // STASH DEN: SE smuggler front (13×13, h7), door west
  defs.push({
    id: 'stashden',
    kind: 'stashden',
    name: 'STASH DEN',
    icon: '🔒',
    color: 0xc46bff,
    x: 52,
    z: 52,
    signY: 9,
    doorX: 52 - 7.7,
    doorZ: 52,
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
  opened: false,
  claimedBy: '',
  claimedName: '',
}));

let initialized = false;
let sceneRef: THREE.Scene | null = null;
let firstBreachDone = false;
let keysBound = false;

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
    ring.renderOrder = 4; // ground decal — mobile depth buffers z-fight coplanar layers
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
  strips.renderOrder = 4; // ground decal — mobile depth buffers z-fight coplanar layers
  scene.add(strips);
}

function setNodeReadyLook(node: BreachNode, ready: boolean): void {
  // BREACHED scar: a permanently-breached node never pulses again. The
  // door tints toward charred red and the ready-ring is killed. The
  // sign is also dimmed (it's no longer interactive).
  if (node.opened) {
    if (node.doorMat) {
      node.doorMat.color.setHex(0x440a14);
      node.doorMat.opacity = ready ? 0.55 : 0.18;
    }
    if (node.ringMat) {
      node.ringMat.color.setHex(0x6a0a14);
      node.ringMat.opacity = ready ? 0.25 : 0.1;
    }
    if (node.sign) node.sign.material.opacity = 0.3;
    return;
  }
  if (node.doorMat) {
    node.doorMat.color.setHex(node.color);
    node.doorMat.opacity = ready ? 0.8 : 0.1;
  }
  if (node.ringMat) {
    node.ringMat.color.setHex(node.color);
    node.ringMat.opacity = ready ? 0.45 : 0.06;
  }
  if (node.sign) node.sign.material.opacity = ready ? 1 : 0.3;
  if (node.shrineKind) setShrineReadyByKind(node.shrineKind, ready);
}

// --- POIS ---

/** Ready doors get wayfinding arrows; depots only signpost when nearby. */
/**
 * Collect POIs for breach doors that are off cooldown (ready to jack into).
 *
 * @returns {Poi[]} list of breach door POIs for the wayfinding system
 */
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
/**
 * Return positions of relay towers that are off cooldown and ready to breach.
 *
 * @returns {{ x: number; z: number }[]} ready relay positions
 */
export function getReadyRelaySpots(): { x: number; z: number }[] {
  return nodes
    .filter((n) => n.kind === 'relay' && n.cooldown <= 0)
    .map((n) => ({ x: n.x, z: n.z }));
}

/** Check whether a breach node has been permanently breached (opened=true). */
export function isNodeBreached(id: string): boolean {
  return nodes.some((n) => n.id === id && n.opened);
}

// ---------------------------------------------------------------------------
// CO-OP NODE ARBITRATION
//
// Breaching is available to every player, host or joiner. What must be
// arbitrated is *node ownership*: two players cannot dive the same terminal,
// and cooldown/opened state has to read the same on everyone's screen.
//
// So the host owns node state and nothing else. The dive itself is a local,
// single-player sub-experience — it is never replicated, and its rewards are
// applied by the diver locally (the same trust model chest ceremonies already
// use: PvE co-op, no anti-cheat requirement).
//
// Flow: client asks (`breach-claim`) → host grants or denies → client plays →
// client reports (`breach-resolve`) → host sets cooldown and tells everyone.
// The host runs the identical path with the round trip skipped.
// ---------------------------------------------------------------------------

/** Wire-form node state. Small enough to ride the 1Hz reliable event channel. */
export interface NetNodeState {
  id: string;
  cd: number;
  op: boolean;
  by: string;
  bn: string;
}

/** Local connection id, or '' in solo. */
function selfId(): string {
  return netGetLocalId() ?? '';
}

let netGetLocalId: () => string | undefined = () => undefined;
let netSendRequest: (reqType: string, data: unknown) => void = () => {};
let netSendDirect: (targetId: string, eventType: string, data: unknown) => void = () => {};
let netBroadcast: (eventType: string, data: unknown) => void = () => {};

/**
 * Installed once by network.ts at module init. Keeps BreachSystem free of a
 * static import on the network layer (which imports BreachSystem itself).
 */
export function bindBreachNet(hooks: {
  getLocalId: () => string | undefined;
  sendRequest: (reqType: string, data: unknown) => void;
  sendDirect: (targetId: string, eventType: string, data: unknown) => void;
  broadcast: (eventType: string, data: unknown) => void;
}): void {
  netGetLocalId = hooks.getLocalId;
  netSendRequest = hooks.sendRequest;
  netSendDirect = hooks.sendDirect;
  netBroadcast = hooks.broadcast;
}

/** HOST: serialise node state for replication. */
export function netCollectNodeStates(): NetNodeState[] {
  return nodes.map((n) => ({
    id: n.id,
    cd: Math.round(n.cooldown * 10) / 10,
    op: n.opened,
    by: n.claimedBy,
    bn: n.claimedName,
  }));
}

/** CLIENT: adopt the host's node state. */
export function netApplyNodeStates(list: NetNodeState[]): void {
  if (!Array.isArray(list)) return;
  for (const s of list) {
    const node = nodes.find((n) => n.id === s.id);
    if (!node) continue;
    const wasReady = node.cooldown <= 0 && !node.claimedBy;
    node.cooldown = s.cd;
    node.opened = s.op;
    node.claimedBy = s.by || '';
    node.claimedName = s.bn || '';
    const isReady = node.cooldown <= 0 && !node.claimedBy;
    if (wasReady !== isReady) setNodeReadyLook(node, isReady);
  }
}

/** HOST: broadcast current node state to the party. */
function pushNodeStates(): void {
  if (!uiState.isMultiplayer || !uiState.isHost) return;
  netBroadcast('breach-nodes', { nodes: netCollectNodeStates() });
}

/**
 * HOST: a player (possibly the host itself) wants node `nodeId`.
 * Returns true when the claim was granted.
 */
export function netHandleClaim(
  fromId: string,
  fromName: string,
  nodeId: string,
  claimantFirstBreach = false,
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  if (node.cooldown > 0) {
    netSendDirect(fromId, 'breach-denied', { reason: 'COOLING DOWN' });
    return false;
  }
  if (node.claimedBy && node.claimedBy !== fromId) {
    netSendDirect(fromId, 'breach-denied', { reason: `${node.claimedName} IS INSIDE` });
    return false;
  }

  node.claimedBy = fromId;
  node.claimedName = fromName || 'PLAYER';
  setNodeReadyLook(node, false);
  pushNodeStates();
  // The host grants itself synchronously in startBreach — only a remote
  // claimant needs the reply packet.
  if (fromId !== selfId()) {
    // Security 0 is the newcomer grace (worth a 1.5x time budget in the
    // mini-game). It keys off whether THAT player has breached before, not the
    // host's own history — otherwise a joiner's very first breach silently
    // arrived at full difficulty while a solo player's first is eased.
    netSendDirect(fromId, 'breach-granted', {
      nodeId,
      security: claimantFirstBreach ? 0 : computeSecurity(),
    });
  }
  return true;
}

/**
 * HOST: a diver reported how their dive ended. Node state is the host's call;
 * the loot was already applied on the diver's own machine.
 */
export function netHandleResolve(
  fromId: string,
  nodeId: string,
  outcome: 'win' | 'fail' | 'abort',
  kind?: string,
): void {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;
  // Only the claimer may resolve — a stale packet from a disconnected peer
  // must not clear a node someone else is currently inside.
  if (node.claimedBy && node.claimedBy !== fromId) return;

  node.claimedBy = '';
  node.claimedName = '';
  if (outcome === 'win') {
    node.cooldown = (kind ?? node.kind) === 'depot' ? COOLDOWN_WIN_DEPOT : COOLDOWN_WIN;
    node.opened = true;
  } else {
    node.cooldown = outcome === 'fail' ? COOLDOWN_FAIL : COOLDOWN_ABORT;
  }
  setNodeReadyLook(node, false);
  pushNodeStates();
}

/** HOST: release every node a departing player was holding. */
export function netReleaseNodesOf(connId: string): void {
  let dirty = false;
  for (const node of nodes) {
    if (node.claimedBy === connId) {
      node.claimedBy = '';
      node.claimedName = '';
      node.cooldown = Math.max(node.cooldown, COOLDOWN_ABORT);
      setNodeReadyLook(node, false);
      dirty = true;
    }
  }
  if (dirty) pushNodeStates();
}

/** CLIENT: the host granted our claim — open the mini-game now. */
export function netOnBreachGranted(nodeId: string, security: number): void {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || uiState.breach || uiState.dive) return;
  pendingClaimNodeId = '';
  openBreachUI(node, security, pendingClaimOverclock);
}

/** CLIENT: the host refused. */
export function netOnBreachDenied(reason: string): void {
  pendingClaimNodeId = '';
  announce(reason || 'NODE UNAVAILABLE');
  haptics.hit();
}

/** Tell the host how our dive ended (no-op in solo / on the host itself). */
function reportResolve(node: BreachNode, outcome: 'win' | 'fail' | 'abort'): void {
  if (!uiState.isMultiplayer) return;
  if (uiState.isHost) {
    netHandleResolve(selfId(), node.id, outcome, node.kind);
  } else {
    netSendRequest('breach-resolve', { nodeId: node.id, outcome, kind: node.kind });
  }
}

/** Node id we have asked the host for but not yet been granted. */
let pendingClaimNodeId = '';
let pendingClaimOverclock = false;

// --- BREACH LIFECYCLE ---

/** Open the mini-game for the prompted node (E key / prompt button). */
/**
 * Open the breach mini-game for the nearest ready node.
 *
 * @param {boolean} overclock - true to use the overclock (enhanced) entry
 */
export function startBreach(overclock: boolean): void {
  const prompt = uiState.breachPrompt;
  if (!prompt || uiState.breach || uiState.dive) return;
  // The world is frozen behind a modal — the prompt is stale; don't jack in
  // under an upgrade screen or the pause menu
  if (uiState.showUpgrade || uiState.isPaused || uiState.gameState !== 'PLAYING') return;
  const node = nodes.find((n) => n.id === prompt.nodeId);
  if (!node || node.cooldown > 0) return;
  if (node.claimedBy && node.claimedBy !== selfId()) {
    announce(`${node.claimedName} IS INSIDE`);
    haptics.hit();
    return;
  }

  // Co-op joiner: the node is the host's to hand out. Ask, and open the
  // mini-game when the grant comes back (netOnBreachGranted). Without the round
  // trip two players standing on the same door would both dive it.
  if (uiState.isMultiplayer && !uiState.isHost) {
    if (pendingClaimNodeId) return; // a claim is already in flight
    pendingClaimNodeId = node.id;
    pendingClaimOverclock = overclock;
    uiState.breachPrompt = null;
    netSendRequest('breach-claim', { nodeId: node.id, first: !firstBreachDone });
    haptics.select();
    return;
  }

  // Host: arbitrate against ourselves first, so a joiner mid-claim wins the race.
  if (uiState.isMultiplayer && uiState.isHost) {
    if (!netHandleClaim(selfId(), uiState.playerName || 'HOST', node.id)) return;
  }
  openBreachUI(node, prompt.security, overclock);
}

/** Actually open the mini-game overlay for a node we now own. */
function openBreachUI(node: BreachNode, security: number, overclock: boolean): void {
  firstBreachDone = true;
  uiState.breachPrompt = null;
  uiState.breachShield = 1;
  // Park the fighter: a touch drag that opened the breach must not keep
  // steering the ship underneath the mini-game.
  resetVirtualJoystick();
  uiState.breach = {
    nodeId: node.id,
    kind: node.kind,
    name: node.name,
    icon: node.icon,
    color: cssColor(node.color),
    security,
    overclock,
  };
  playMenuBuy();
  haptics.select();
}

/** SKELETON KEY: skip the mini-game, take the reward (F key / prompt button). */
/**
 * Consume a skeleton key to bypass the breach mini-game and take the reward.
 * NOTE: skeleton-key bypassed wins do NOT grant rootkits — exploits are hard
 * to get, skeleton keys give you the loot but NOT the rootkit.
 */
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
/**
 * Resolve the breach mini-game with the given outcome and apply rewards or penalties.
 *
 * @param {'win' | 'fail' | 'abort'} outcome - how the breach ended
 */
export function resolveBreach(outcome: 'win' | 'fail' | 'abort'): void {
  const breach = uiState.breach;
  if (!breach) return;
  const node = nodes.find((n) => n.id === breach.nodeId);
  uiState.breach = null;
  flushDeferredLevelUps();
  if (!node) return;

  if (outcome === 'win') {
    // Win → jack INTO the breach dive. The dive owns the rest of the
    // win-resolution flow now: on dive WIN-exit it calls
    // completeBreachWin() (grantReward + cooldown + opened=true); on a
    // dive FAIL/abort exit it calls completeBreachFail(). We therefore
    // return early without touching cooldown/reward here.
    //
    // This runs in co-op too, for host and joiner alike. The dive is a local
    // sub-experience; the arena keeps simulating around the diver's kneeling
    // body (see main.ts) and the node stays claimed until they report back.
    enterDive(node, breach.overclock, breach.security, sceneRef);
    return;
  } else if (outcome === 'fail') {
    node.cooldown = COOLDOWN_FAIL;
    announce('TRACE DETECTED — LOCKED OUT');
    haptics.hit();
    // High-stakes fails bite back: the ICE dispatches a hunter
    if (breach.security >= 3 || breach.overclock) spawnTracer(node);
    reportResolve(node, 'fail');
  } else {
    node.cooldown = COOLDOWN_ABORT;
    reportResolve(node, 'abort');
  }
  setNodeReadyLook(node, false);
}

/**
 * Compute a 0..1 quality score from the dive outcome. Closer to 1 = a cleaner
 * clear. Used to scale loot quantities and gate rootkit grants.
 *
 * Trace is the dive's only clock, so `1 - trace/traceMax` already IS "how much
 * of the budget you had left" — there is no separate elapsed-time term to add
 * (the old version double-counted, penalising slow clears twice, and the
 * penalty was calibrated against a 30s target that no verb could hit).
 */
function computeDiveQuality(outcome: DiveOutcome): number {
  const headroom = 1 - outcome.trace / outcome.traceMax;
  return clamp01(0.35 + headroom * 0.55 + outcome.bonus * 0.2 + (outcome.overclock ? 0.1 : 0));
}

/**
 * Apply the full breach-WIN resolution (called by BreachDiveSystem on a
 * dive WIN-exit). Replicates the old resolveBreach win branch (grantReward +
 * cooldown + setNodeReadyLook) and additionally marks the node permanently
 * BREACHED. `grantReward` stays module-private; this is the public seam.
 *
 * The rootkit grant is synchronous. It used to run in a fire-and-forget async
 * IIFE around `await import(/* @vite-ignore *\/ path)` with a runtime variable
 * path, to "gracefully degrade" if ExploitRegistry were absent. It is not
 * absent — this module already imports it statically — and the indirection
 * silently broke every production build: @vite-ignore leaves the specifier
 * alone, so the bundle shipped a literal '../core/ExploitRegistry' that the
 * browser resolved against /assets/ to /core/ExploitRegistry, which 404s. The
 * catch swallowed it and returned null, so the ONLY source of exploits in the
 * game never fired for anyone who played a real build.
 */
export function completeBreachWin(node: BreachNode, outcome: DiveOutcome): void {
  const quality = computeDiveQuality(outcome);
  const isFirstBreach = !node.opened;

  if (isFirstBreach) {
    announce('BREACHED — ' + node.name);
  }

  grantReward(node, outcome.overclock, quality, outcome.bonus);

  // Rootkit grant: fire-and-forget async. Never awaited, never throws.
  // Skeleton-key bypassed wins skip this entirely (useSkeletonKey calls
  // grantReward directly — exploits are hard to get, skeleton keys give
  // loot but NOT rootkits).
  // ROOTKIT GATE. This is the ONLY source of exploits in the whole game,
  // so the gate has to be reachable AND legible — see
  // ExploitRegistry.qualifiesForRootkit for the rule and why the old one
  // (security >= 2 AND trace <= 60% AND a vault kind AND an OVERCLOCKED
  // breach, none of it stated anywhere) never fired for real players.
  //
  // Slots still hard-cap the total at 3, so a re-hackable vault cannot be
  // farmed past the ceiling.
  const player = world.with('isLocalPlayer', 'position').first;
  if (player) {
    const traceFraction = outcome.traceMax > 0 ? outcome.trace / outcome.traceMax : 1;
    const owned = (player.exploitSlots ?? []).filter(Boolean).length;
    if (qualifiesForRootkit(node.kind, outcome.security, traceFraction, owned)) {
      const granted = tryGrantRootkit(player, node.kind, outcome.overclock);
      if (granted) {
        announce('ROOTKIT ACQUIRED — ' + granted.name);
        playLevelUp();

        // First one ever: stop the run and explain what just happened. The slot
        // only appears in the loadout bar once this has been read.
        if (!uiState.exploitsRevealed) {
          uiState.exploitTutorial = {
            name: granted.name,
            icon: granted.icon,
            desc: granted.desc,
            tag: formatBehaviourTag(granted),
            rarity: granted.rarity ?? 'rare',
          };
        }
      }
    }
  }

  node.cooldown = node.kind === 'depot' ? COOLDOWN_WIN_DEPOT : COOLDOWN_WIN;
  node.opened = true;
  setNodeReadyLook(node, false);
  reportResolve(node, 'win');
}

/**
 * Apply a dive FAIL/abort resolution (called by BreachDiveSystem on a dive
 * non-win exit). For Chunk 2 this mirrors the old fail cooldown + look; Chunk
 * 3 will rewire the fail path to spawn an ambush at the dive exit.
 */
export function completeBreachFail(node: BreachNode): void {
  node.cooldown = COOLDOWN_FAIL;
  announce('DIVE ABORTED — LOCKED OUT');
  haptics.hit();
  setNodeReadyLook(node, false);
  reportResolve(node, 'fail');
}

// legacyWinResolve (instant loot grant, no dive) is gone: co-op now runs the
// real dive for host and joiner alike, so nothing needs the downgraded path.

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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function scaleQty(base: number, quality: number): number {
  return Math.max(1, Math.round(base * (0.6 + quality)));
}

function grantReward(
  node: BreachNode,
  overclock: boolean,
  quality: number = 0.5,
  bonus: number = 0,
): void {
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
      const n = scaleQty(overclock ? 4 : 2, quality);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        world.add({
          isPickup: true,
          pickupType: types[Math.floor(Math.random() * 3)],
          position: new THREE.Vector3(dropX + Math.cos(a) * 1.8, 0.8, dropZ + Math.sin(a) * 1.8),
          velocity: new THREE.Vector3(),
        });
      }
      const credits = scaleQty(overclock ? 14 : 7, quality);
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
      const bankRarity: 'rare' | 'epic' = overclock || quality >= 0.85 ? 'epic' : 'rare';
      spawnChest(scene, dropX, dropZ, bankRarity);
      const credits = scaleQty(overclock ? 20 : 10, quality);
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
      // The banked stack is the whole point of the gamble verb — a deep stack
      // pays a second chest on top of the scaled credit shower.
      if (bonus >= 0.66) {
        spawnChest(scene, dropX + 2.5, dropZ + 2.5, 'epic');
        announce('DEEP STACK BANKED — DOUBLE PAYOUT');
      }
      const credits = scaleQty(Math.round((overclock ? 16 : 8) * (1 + bonus)), quality);
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

/**
 * Reset all breach system state for a no-reload restart.
 */
export function resetBreachSystem(): void {
  firstBreachDone = false;
  for (const node of nodes) {
    node.cooldown = 0;
    node.opened = false;
    setNodeReadyLook(node, true);
  }
  uiState.breach = null;
  uiState.breachPrompt = null;
  uiState.breachShield = 1;
  uiState.skeletonKeys = 0;
  uiState.relaySlowTimer = 0;
  // Dive halves: clear the sub-scene + shared dive flags so a no-reload
  // restart doesn't resurrect a stale dive on a fresh arena.
  resetBreachDiveSystem();
}

// --- TICK ---

/**
 * Per-frame breach tick: manage cooldowns, pulse ready rings, drive the
 * door prompt, and handle the defend-the-hacker shield in co-op.
 *
 * @param {number} dt - delta time since last frame in seconds
 * @param {THREE.Scene} scene - the Three.js scene for initial dressing setup
 * @returns {void}
 */
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
    } else if (node.ringMat && !node.opened) {
      // Skip the per-frame pulse for BREACHED nodes — their ring is a
      // permanent red scar, not a "ready to jack in" beacon.
      node.ringMat.opacity = 0.35 + 0.18 * Math.sin(now * 3 + i * 1.7);
    }
  }

  // Doors are live for EVERY player, host or joiner. Node ownership is
  // arbitrated by the host (see netHandleClaim) rather than by refusing to
  // show joiners a prompt — which is what used to make half the party
  // spectators to the game's headline mechanic.
  const player = world.with('isLocalPlayer', 'position', 'health').first;
  if (!player || !player.health || player.health.current <= 0) {
    if (uiState.breachPrompt) uiState.breachPrompt = null;
    // Going down while jacked in has to END the session, not freeze it. This
    // guard used to return before the upkeep below, so a downed diver stayed
    // `isDiving` forever — and since PlayerControlSystem zeroes velocity and
    // WeaponSystem skips firing for ANY diving player, they came back from the
    // revive unable to move or shoot for the rest of the run.
    if (player && (uiState.breach || uiState.dive)) {
      announce('CONNECTION LOST — OPERATOR DOWN');
      if (uiState.dive) ejectDive();
      else resolveBreach('abort');
      player.isDiving = false;
    }
    return;
  }
  // Belt and braces: never leave a live player parked as a diver when no dive
  // is actually running locally.
  if (player.isDiving && !uiState.dive) player.isDiving = false;

  // Mid-breach upkeep: the fighter kneels at the terminal under a shield.
  // This covers the DIVE as well as the mini-game — in co-op the arena keeps
  // running for the whole time the pilot is in cyberspace, which is exactly
  // when their body is most defenceless and the team has a job to do.
  if (uiState.breach || uiState.dive) {
    if (!uiState.isMultiplayer) {
      // Solo: shield holds — but the pile-up outside is real
      player.invulnTimer = Math.max(player.invulnTimer ?? 0, 0.3);
    } else {
      // Co-op defend-the-hacker: every enemy near the door eats the shield.
      //
      // Rates are per-enemy-per-second against a 0..1 bar, so the wall-clock
      // budget is (1 / (rate * enemies)). The old 0.025 with a cap of 10 meant
      // 0.25/s — the shield was gone in FOUR SECONDS at ordinary horde density,
      // which read as "the hacking timer is way too fast in multiplayer",
      // because this bar is the clock the player actually watches. A dive runs
      // 40-55s, so it gets a gentler rate still.
      //
      // The shield also REGENERATES when the door is clear. Without that,
      // teammates clearing the swarm produced no visible reward and the breach
      // was doomed the moment it dipped.
      const DRAIN_PER_ENEMY = uiState.dive ? 0.005 : 0.01;
      const NEAR_CAP = 8;
      const REGEN = 0.08;
      let near = 0;
      for (const enemy of world.with('isEnemy', 'position')) {
        const dx = enemy.position.x - player.position.x;
        const dz = enemy.position.z - player.position.z;
        if (dx * dx + dz * dz < 81) {
          near++;
          if (near >= NEAR_CAP) break;
        }
      }
      if (near > 0) uiState.breachShield -= near * DRAIN_PER_ENEMY * dt;
      else uiState.breachShield = Math.min(1, uiState.breachShield + REGEN * dt);
      if (uiState.breachShield > 0) {
        player.invulnTimer = Math.max(player.invulnTimer ?? 0, 0.3);
      } else {
        announce('BREACH SHIELD DOWN — EJECTED');
        // The shield can now collapse mid-DIVE too, not just mid-mini-game.
        // Route to the right ejector: resolveBreach only understands the
        // overlay, and would no-op while uiState.breach is already null.
        if (uiState.dive) ejectDive();
        else resolveBreach('abort');
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
    // Rootkits were undiscoverable partly because nothing ever said which
    // doors could hold one. The prompt now names it before you commit, using
    // the SAME predicate the grant runs so the door can never lie. (Trace is
    // unknowable before the dive, so it is asserted clean here — the promise
    // is "this vault can hold one", not "you have already earned it".)
    const owned = uiState.exploitSlots.filter(Boolean).length;
    const rootkit =
      ROOTKIT_KINDS.has(best.kind) &&
      owned < 3 &&
      qualifiesForRootkit(best.kind, security, 0, owned);
    const p = uiState.breachPrompt;
    if (
      !p ||
      p.nodeId !== best.id ||
      p.security !== security ||
      p.hasKey !== hasKey ||
      p.rootkit !== rootkit ||
      p.opened !== best.opened
    ) {
      uiState.breachPrompt = {
        nodeId: best.id,
        name: best.name,
        icon: best.icon,
        color: cssColor(best.color),
        security,
        hasKey,
        rootkit,
        opened: best.opened,
      };
    }
  } else if (uiState.breachPrompt) {
    uiState.breachPrompt = null;
  }
}
