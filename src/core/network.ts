import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';
import { world, type Entity } from './world';
import { uiState, showToast, announce } from './UIState.svelte';
import { setGameState } from './GameState';
import { spawnPlayer, spawnEnemy, spawnXP, applyCharacterModel } from './factories';
import { spawnChest, openChestLocally } from '../systems/ChestSystem';
import { spawnClientBoss, removeClientBoss } from '../systems/FinaleBoss';
import { removeBody, createDynamicBody, isRapierInitialized } from './RapierWorld';

// Player collider radius (matches spawnPlayer in factories) — used to give
// remote players a body on the host so they take damage.
const PLAYER_RADIUS = 0.8;
import { playLevelUp, playChestOpen, playHurt } from './audio';
import { addTrauma } from '../systems/CameraSystem';
import { spawnDamageNumber } from '../systems/DamageNumberSystem';
import { haptics } from './haptics';
import { triggerLevelUp } from '../systems/UpgradeSystem';
import { WEAPONS, getWeaponStatsAtLevel } from './WeaponRegistry';
import { submitRunToLeaderboard } from './leaderboard';
import { initRtc, closeRtc, closeRtcPeer, rtcSendStateTo } from './rtc';
import { spawnClientDeathFx, playLocalXpPickup } from '../systems/ClientCombatFxSystem';
import { createCustomProjectileMesh } from './projectileVisuals';
import type { WeaponSlot } from './world';

let socket: Socket | null = null;
let activeScene: THREE.Scene | null = null;

// Map to track remote player entities: connectionId -> entity
export const remotePlayers = new Map<string, any>();

// --- P2P / DUAL-TRANSPORT STATE ---
// State snapshots flow P2P-first (WebRTC, unreliable/unordered) and fall back
// to the socket relay per peer. Because the same snapshot can arrive on both
// paths (mixed parties) and the P2P channel may reorder, every snapshot carries
// a sequence number and receivers keep only the newest.
let hostConnId = ''; // who clients address their state updates to
let clientSeq = 0; // our outgoing client-update counter
let hostSeq = 0; // host's outgoing snapshot counter
let lastHostSeqSeen = 0; // newest host snapshot we've applied (client side)

/** Messages arriving over the P2P data channel (same shape as socket relays). */
function handleRtcMessage(type: string, data: any, fromId: string) {
  if (type === 'cu' && uiState.isHost) {
    handleClientState(fromId, data);
  } else if (type === 'hu' && !uiState.isHost) {
    handleHostState(data);
  }
}

// Rebuild the live party roster (co-op teammate HUD + end-of-run scoreboard)
// from a host players payload. Entry fields: { c, n, h, m, l, k, d, r, ch }.
function rebuildPartyFromPayload(players: any[]) {
  uiState.party = players.map((p: any) => ({
    connectionId: p.c,
    name: p.n || 'PLAYER',
    hp: Math.round(p.h ?? 0),
    maxHp: Math.round(p.m ?? 100),
    level: p.l || 1,
    kills: p.k || 0,
    dead: p.d === 1,
    revivePct: Math.round((p.r || 0) * 100),
    character: p.ch || 'cypher',
    isLocal: p.c === socket?.id,
  }));
}

// Helper to determine socket URL
const getSocketUrl = (): string => {
  // 1. Explicit per-user override (Settings → Signaling beacon) always wins.
  if (uiState.customServerUrl) {
    return uiState.customServerUrl;
  }
  // 2. An explicitly configured server (VITE_SIGNALING_SERVER_URL, e.g. the HF
  //    Space) is used everywhere — including localhost dev — so a local build
  //    can join the same hosted server as the deployed game. Set it in a
  //    .env.local for local runs; netlify.toml sets it for production.
  const envUrl = import.meta.env.VITE_SIGNALING_SERVER_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  // 3. No server configured: on localhost fall back to a local signaling
  //    server (npm run server), otherwise guess from the page origin.
  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) {
    return 'http://localhost:3001';
  }
  console.warn(
    '[Network] VITE_SIGNALING_SERVER_URL is not set. Falling back to relative origin replace.',
  );
  return window.location.origin.replace('5173', '3001');
};

/** Resolved base URL of the signaling/leaderboard server (same host socket.io uses). */
export function getServerBaseUrl(): string {
  return getSocketUrl();
}

export function setNetworkScene(scene: THREE.Scene) {
  activeScene = scene;
}

export function isConnected(): boolean {
  return socket !== null && socket.connected;
}

export function getSocket(): Socket | null {
  return socket;
}

export function getLocalConnectionId(): string | undefined {
  return socket?.id;
}

// --- PARTY / LOBBY API ---

// 1. Host creates a lobby
export function hostRoom() {
  uiState.networkStatus = 'connecting';

  if (!socket) {
    socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    setupSocketListeners();
  }

  socket.emit('host-create-room', {
    name: uiState.playerName || 'HOST',
    character: uiState.selectedCharacter,
  });
}

// 2. Client joins a lobby
export function joinRoom(roomCode: string) {
  uiState.networkStatus = 'connecting';

  if (!socket) {
    socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    setupSocketListeners();
  }

  socket.emit('client-join-room', {
    roomCode,
    name: uiState.playerName || 'PLAYER',
    character: uiState.selectedCharacter,
  });
}

/** Toggle own ready state / change character while in the lobby. */
export function setLobbyState(update: { ready?: boolean; character?: string; name?: string }) {
  if (!socket || socket.disconnected) return;
  if (update.character) uiState.selectedCharacter = update.character;
  socket.emit('lobby-set', { roomCode: uiState.roomCode, ...update });
}

/** Host: start the run for the whole party (server enforces all-ready). */
export function startPartyGame() {
  if (!socket || socket.disconnected || !uiState.isHost) return;
  socket.emit('start-game', { roomCode: uiState.roomCode });
}

// 3. Disconnect from room/server
export function disconnectNetwork() {
  closeRtc();
  hostConnId = '';
  clientSeq = 0;
  hostSeq = 0;
  lastHostSeqSeen = 0;
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Clean up remote player avatars
  for (const connId of remotePlayers.keys()) {
    removeRemotePlayer(connId);
  }

  uiState.isMultiplayer = false;
  uiState.isHost = false;
  uiState.roomCode = '';
  uiState.networkStatus = 'disconnected';
  uiState.party = [];
  uiState.lobby = { players: [], started: false };
  remotePlayers.clear();
}

function removeRemotePlayer(connId: string) {
  const player = remotePlayers.get(connId);
  if (player) {
    if (activeScene && player.transform) {
      activeScene.remove(player.transform);
    }
    if (player.rigidBody) {
      removeBody(player.rigidBody);
    }
    world.remove(player);

    // Also remove their weapons
    for (const w of world.with('isWeapon', 'ownerId')) {
      if (w.ownerId === player.id) {
        world.remove(w);
      }
    }
    remotePlayers.delete(connId);
  }
  uiState.remotePlayersCount = remotePlayers.size;
}

/** Apply a player's full character visual identity (tint + silhouette). */
function applyCharacterTint(entity: any, characterId: string) {
  entity.character = characterId;
  if (entity.transform) {
    applyCharacterModel(entity.transform, characterId);
  }
}

/** Spawn (or fetch) a remote player avatar by connection id. */
function ensureRemotePlayer(connId: string, x: number, z: number, name?: string, ch?: string): any {
  let player = remotePlayers.get(connId);
  if (!player && activeScene) {
    spawnPlayer(activeScene, false, connId, x, z);
    player = Array.from(world.with('isPlayer')).find((e: any) => e.connectionId === connId);
    if (player) {
      player.playerName = name || 'PLAYER';
      player.kills = 0;
      if (ch) applyCharacterTint(player, ch);

      // HOST ONLY: give remote players a physics collider so the host's
      // authoritative collision simulation actually hits them. spawnPlayer only
      // creates a body for the LOCAL player, so without this only the host ever
      // took contact/projectile damage. (Clients don't simulate damage, so they
      // don't need remote-player colliders.)
      if (uiState.isHost && isRapierInitialized() && player.id !== undefined && !player.rigidBody) {
        const { rigidBody, collider } = createDynamicBody(x, z, PLAYER_RADIUS, player.id);
        player.rigidBody = rigidBody;
        player.collider = collider;
      }

      remotePlayers.set(connId, player);
      uiState.remotePlayersCount = remotePlayers.size;
    }
  }
  return player;
}

/**
 * HOST: make a remote player's weapon entities match their reported weaponSlots.
 * The host simulates every player's weapons authoritatively — without this,
 * upgrades a client picks never exist host-side and deal zero damage.
 */
function reconcileRemoteWeapons(player: any, slots: WeaponSlot[]) {
  const owned = new Map<string, any>();
  for (const w of world.with('isWeapon', 'ownerId', 'weapon')) {
    if (w.ownerId === player.id) owned.set(w.weaponId || '', w);
  }

  const slotIds = new Set(slots.map((s) => s.weaponId));

  for (const slot of slots) {
    const def = WEAPONS[slot.weaponId];
    const stats = getWeaponStatsAtLevel(slot.weaponId, slot.level);
    if (!def || !stats) continue;

    const existing = owned.get(slot.weaponId);
    if (existing) {
      // Level/evolution changes: refresh numbers in place
      existing.weapon.fireRate = stats.cooldown;
      existing.weapon.damage = stats.damage;
      existing.weapon.bulletCount = stats.projectiles;
      existing.weapon.bulletPierce = stats.pierce;
    } else {
      world.add({
        isWeapon: true,
        weaponId: slot.weaponId,
        ownerId: player.id,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        weapon: {
          cooldownTimer: 0.5,
          fireRate: stats.cooldown,
          damage: stats.damage,
          bulletSpeed: def.baseSpeed,
          bulletColor: def.color,
          bulletLifetime: def.baseLifetime,
          category: def.category,
          bulletWidth: def.bulletWidth,
          bulletLength: def.bulletLength,
          visualStyle: def.visualStyle,
          bulletCount: stats.projectiles,
          bulletSpread: def.baseSpread,
          knockback: def.baseKnockback,
          bulletPierce: stats.pierce,
          bulletExplodeRadius: def.explodeRadius,
        },
      });
    }
  }

  // Remove host-side weapons the client no longer has (evolution replaced them)
  for (const [weaponId, entity] of owned) {
    if (!slotIds.has(weaponId)) {
      world.remove(entity);
      // Clear that weapon's orbitals too
      for (const orbital of world.with('isOrbital', 'orbitalData')) {
        if (orbital.orbitalData?.ownerId === player.id && orbital.weaponId === weaponId) {
          orbital.lifeTimer = -1;
        }
      }
    }
  }
}

function setupSocketListeners() {
  if (!socket) return;

  socket.on('connect', () => {
    console.log('[Network] Connected to signaling server');
  });

  socket.on('room-created', ({ roomCode }) => {
    uiState.isMultiplayer = true;
    uiState.isHost = true;
    uiState.roomCode = roomCode;
    uiState.networkStatus = 'in_lobby';
    console.log(`[Network] Room created: ${roomCode} (Hosting)`);

    const local = world.with('isLocalPlayer').first;
    if (local && socket) {
      local.connectionId = socket.id;
    }
  });

  socket.on('joined-room', ({ roomCode }) => {
    uiState.isMultiplayer = true;
    uiState.isHost = false;
    uiState.roomCode = roomCode;
    uiState.networkStatus = 'in_lobby';
    console.log(`[Network] Joined lobby: ${roomCode} (Client)`);

    const local = world.with('isLocalPlayer').first;
    if (local && socket) {
      local.connectionId = socket.id;
    }
  });

  // Lobby roster changed (join/leave/ready/character)
  socket.on('lobby-state', (lobby: any) => {
    uiState.lobby = {
      players: lobby.players,
      started: lobby.started,
    };
  });

  // Host pressed START — the whole party begins simultaneously
  socket.on('game-started', (lobby: any) => {
    uiState.lobby = { players: lobby.players, started: true };
    uiState.networkStatus = 'connected';

    // Remember who hosts (clients address their P2P state updates to them)
    hostConnId = lobby.players.find((p: any) => p.isHost)?.connectionId || '';

    // Reset the snapshot sequence counters for the new game. Without this, a
    // client that already played one game keeps a high lastHostSeqSeen and
    // rejects every snapshot of the next game (whose host counts up from 1).
    clientSeq = 0;
    hostSeq = 0;
    lastHostSeqSeen = 0;

    // Host spawns remote avatars now, spread around the spawn point, tinted
    // by each player's chosen character.
    if (uiState.isHost && activeScene) {
      let i = 1;
      for (const p of lobby.players) {
        if (p.connectionId === socket?.id) continue;
        const angle = (i / Math.max(1, lobby.players.length - 1)) * Math.PI * 2;
        const player = ensureRemotePlayer(
          p.connectionId,
          Math.cos(angle) * 3,
          Math.sin(angle) * 3,
          p.name,
          p.character,
        );
        if (player) player.playerName = p.name;
        i++;
      }
    }

    // Open direct P2P channels for the 30Hz state sync (relay stays as
    // fallback per-peer). Host offers to every client; clients answer.
    if (socket) {
      const selfId = socket.id;
      const clientIds = uiState.isHost
        ? lobby.players
            .filter((p: any) => p.connectionId !== selfId)
            .map((p: any) => p.connectionId)
        : [];
      initRtc(socket, uiState.roomCode, clientIds, handleRtcMessage);
    }

    setGameState('PLAYING');
    announce('PARTY DEPLOYED');
  });

  socket.on('start-rejected', ({ message }) => {
    showToast(message || 'Cannot start yet.');
  });

  socket.on('join-error', ({ message }) => {
    showToast(`Failed to join room: ${message}`);
    disconnectNetwork();
  });

  socket.on('player-left', ({ playerId }) => {
    console.log(`[Network] Player left: ${playerId}`);
    const p = remotePlayers.get(playerId);
    if (p?.playerName) showToast(`${p.playerName} left the party`);
    closeRtcPeer(playerId);
    removeRemotePlayer(playerId);
  });

  socket.on('host-disconnected', () => {
    showToast('Host disconnected. Returning to Main Menu.');
    disconnectNetwork();
    setGameState('MENU');
  });

  // Client updates on Host (relay path; P2P path calls handleClientState directly)
  socket.on('client-state-update', ({ playerId, state }) => {
    handleClientState(playerId, state);
  });

  // Host updates on Client (relay path; P2P path calls handleHostState directly)
  socket.on('host-state-update', ({ state }) => {
    handleHostState(state);
  });
  bindRemainingListeners(socket);
}

/** HOST: apply one client's state update (from relay or P2P). */
function handleClientState(playerId: string, state: any) {
  const player = ensureRemotePlayer(
    playerId,
    state.position?.x ?? 0,
    state.position?.z ?? 0,
    state.name,
    state.character,
  );
  if (!player) return;

  // Unordered/dual transport: only apply snapshots newer than the last one
  if (typeof state.seq === 'number') {
    if (state.seq <= (player._netSeq || 0)) return;
    player._netSeq = state.seq;
  }

  // Dead players are host-authoritative: ignore client-reported position
  // while dead so the ghost stays where it fell for revives... actually
  // ghosts may roam; accept position but never health.
  if (player.position) {
    player.position.set(state.position.x, 0.5, state.position.z);
    if (player.transform) {
      player.transform.position.copy(player.position);
    }
  }
  if (player.velocity) {
    player.velocity.set(state.velocity.x, 0, state.velocity.z);
  }
  if (player.aimTarget) {
    player.aimTarget.set(state.aimTarget.x, 0.5, state.aimTarget.z);
  }
  if (player.input) {
    player.input.x = state.input.x;
    player.input.y = state.input.y;
    player.input.isShooting = state.input.isShooting;
  }
  player.facingRight = state.facingRight;
  // NOTE: CURRENT health is HOST-authoritative in co-op (the host simulates
  // all damage; accepting client HP would let a lagging client "undo" hits).
  // MAX health is build-derived (protocols/shop), so the client reports it.
  if (player.health && typeof state.healthMax === 'number' && state.healthMax > 0) {
    if (player.health.max !== state.healthMax) {
      const wasFull = player.health.current >= player.health.max;
      player.health.max = state.healthMax;
      player.health.current = wasFull
        ? state.healthMax
        : Math.min(player.health.current, state.healthMax);
    }
  }
  player.level = state.level;
  player.score = state.score;
  player.isUpgrading = state.isUpgrading;
  if (state.name) player.playerName = state.name;
  if (state.character && player.character !== state.character) {
    applyCharacterTint(player, state.character);
  }
  if (state.stats) {
    player.stats = state.stats;
  }

  // Reconcile the client's build so their upgrades actually fire host-side
  if (state.weaponSlots) {
    const sig = state.weaponSlots.map((s: WeaponSlot) => `${s.weaponId}:${s.level}`).join(';');
    if (player._weaponSig !== sig) {
      player._weaponSig = sig;
      player.weaponSlots = state.weaponSlots;
      reconcileRemoteWeapons(player, state.weaponSlots);
    }
  }
}

/** CLIENT: apply a host snapshot (from relay or P2P). */
function handleHostState(state: any) {
  if (!activeScene) return;

  // Unordered/dual transport: only apply snapshots newer than the last one
  if (typeof state.seq === 'number') {
    if (state.seq <= lastHostSeqSeen) return;
    lastHostSeqSeen = state.seq;
  }

  // 1. Sync Players
  state.players.forEach((pData: any) => {
    const pConnId = pData.c;
    const pPos = { x: pData.p[0], z: pData.p[1] };
    const pVel = { x: pData.v[0], z: pData.v[1] };
    const pFacingRight = pData.f === 1;
    const pHealth = { current: pData.h, max: pData.m };
    const pLevel = pData.l;
    const pScore = pData.s;

    if (pConnId === socket?.id) {
      // Local player on a client: host is authoritative for health/XP/level
      const local: any = world.with('isLocalPlayer', 'health', 'level').first;
      if (local) {
        if (local.health) {
          // HP is host-authoritative; the full hit *feedback* arrives as a
          // targeted 'player-hit' event (see game-event handler) so it plays at
          // the exact moment and carries knockback — no fragile HP-delta guess.
          local.health.current = pHealth.current;
          local.health.max = pHealth.max;
        }
        // XP bar mirrors the host's tally (clients don't collect XP locally)
        if (pData.x !== undefined) local.xp = pData.x;
        if (pData.xm !== undefined) local.xpMax = pData.xm;
        local.kills = pData.k || 0;
        uiState.kills = local.kills ?? 0;
        if (pLevel > (local.level || 1)) {
          // Host says we leveled — open the local upgrade modal
          local.level = pLevel;
          playLevelUp();
          triggerLevelUp();
        }
      }
      return;
    }

    // Remote player on client — smooth toward the host position instead of
    // snapping at network rate (NetSmoothingSystem lerps every frame)
    const player = ensureRemotePlayer(pConnId, pPos.x, pPos.z, pData.n, pData.ch);
    if (player) {
      player.netX = pPos.x;
      player.netZ = pPos.z;
      player.velocity.set(pVel.x, 0, pVel.z);
      player.facingRight = pFacingRight;
      if (player.health) {
        player.health.current = pHealth.current;
        player.health.max = pHealth.max;
      }
      player.level = pLevel;
      player.score = pScore;
      player.kills = pData.k || 0;
      if (pData.ch && player.character !== pData.ch) applyCharacterTint(player, pData.ch);
    }
  });

  // Remove any players that are no longer in host list
  const activeConnIds = new Set(state.players.map((p: any) => p.c));
  for (const connId of remotePlayers.keys()) {
    if (!activeConnIds.has(connId) && socket && connId !== socket.id) {
      removeRemotePlayer(connId);
    }
  }

  // 2. Sync Enemies
  // Skip the boss here — it is flagged `isEnemy` but synced separately (2b).
  const enemyMap = new Map<number, any>();
  for (const e of world.with('isEnemy')) {
    if (e.isBoss) continue;
    enemyMap.set(e.id!, e);
  }

  // Amortize mesh construction: a big wave can introduce 30+ new enemies in a
  // single snapshot and building all their models in one frame is a visible
  // hitch. Cap spawns per snapshot — stragglers arrive on the next one (33ms).
  let spawnBudget = 12;

  state.enemies.forEach((eData: any) => {
    const eId = eData.i;
    const eType = eData.t;
    const ePos = { x: eData.p[0], z: eData.p[1] };
    const eHealth = { current: eData.h, max: eData.h };
    const eFacingRight = eData.f === 1;
    const eHitFlashTimer = eData.fl === 1 ? 0.1 : 0;

    let enemy = enemyMap.get(eId);
    if (!enemy) {
      if (spawnBudget-- <= 0) return; // defer to the next snapshot
      // Spawn local representation at the reported spot (no lerp-in from 0,0)
      enemy = spawnEnemy(activeScene!, ePos.x, ePos.z, eType);
      if (enemy) {
        enemy.id = eId;
        enemy.position.set(ePos.x, 0.5, ePos.z);
      }
    }

    if (enemy) {
      // Smooth toward host position rather than snapping at 30Hz
      enemy.netX = ePos.x;
      enemy.netZ = ePos.z;
      if (enemy.health) {
        enemy.health.current = eHealth.current;
        enemy.health.max = eHealth.max;
      }
      enemy.facingRight = eFacingRight;
      enemy.hitFlashTimer = eHitFlashTimer;
      decodeAbilityState(eData.s ?? 0, enemy);
      enemyMap.delete(eId);
    }
  });

  // Despawn enemies no longer mentioned by Host. If the removal happened near
  // the local player it's a KILL (not a far-off despawn) — play death FX so the
  // joiner sees/hears enemies pop like in single-player.
  const localForFx = world.with('isLocalPlayer', 'position').first;
  // Cap death FX per snapshot so a huge wave-clear doesn't flood particles
  let deathFxBudget = 6;
  for (const obsoleteEnemy of enemyMap.values()) {
    if (localForFx && obsoleteEnemy.position && deathFxBudget > 0) {
      const dx = obsoleteEnemy.position.x - localForFx.position.x;
      const dz = obsoleteEnemy.position.z - localForFx.position.z;
      if (dx * dx + dz * dz < 26 * 26) {
        deathFxBudget--;
        spawnClientDeathFx(
          obsoleteEnemy.position,
          obsoleteEnemy.baseColor ?? 0xff0055,
          activeScene!,
        );
      }
    }
    if (obsoleteEnemy.transform) activeScene?.remove(obsoleteEnemy.transform);
    if (obsoleteEnemy.rigidBody) removeBody(obsoleteEnemy.rigidBody);
    world.remove(obsoleteEnemy);
  }

  // 2c. Sync enemy projectiles (boss glitch ring). Without this the joiner is
  // hit by bullets they literally cannot see — dodging was impossible. Mirrors
  // fly by dead reckoning (straight lines) with a snap correction when they
  // drift, and despawn when the host stops reporting them.
  const epMap = new Map<number, any>();
  for (const p of world.with('isEnemyProjectile')) {
    if (p._epMirror) epMap.set(p.id!, p);
  }
  (state.ep || []).forEach((d: any) => {
    let m = epMap.get(d.i);
    if (!m) {
      const dir = new THREE.Vector3(d.v[0], 0, d.v[1]);
      if (dir.lengthSq() === 0) dir.set(0, 0, 1);
      const mesh = createCustomProjectileMesh(
        'smart_rail_needles',
        d.k ?? 0xff3333,
        0.15,
        0.8,
        dir.clone().normalize(),
      );
      mesh.position.set(d.p[0], 0.5, d.p[1]);
      activeScene!.add(mesh);
      m = world.add({
        isEnemyProjectile: true,
        _epMirror: true,
        position: mesh.position,
        velocity: new THREE.Vector3(d.v[0], 0, d.v[1]),
        transform: mesh,
      } as any);
      m.id = d.i;
    } else {
      // Dead reckoning correction: only snap when meaningfully off-course
      const ex = m.position.x - d.p[0];
      const ez = m.position.z - d.p[1];
      if (ex * ex + ez * ez > 2 * 2) m.position.set(d.p[0], 0.5, d.p[1]);
      m.velocity.set(d.v[0], 0, d.v[1]);
      epMap.delete(d.i);
    }
  });
  for (const gone of epMap.values()) {
    if (gone.transform) activeScene?.remove(gone.transform);
    world.remove(gone);
  }

  // 2b. Sync Boss (host-authoritative; visual mirror on the client)
  const existingBoss = world.with('isBoss', 'position', 'health').first;
  if (state.boss) {
    const bx = state.boss.p[0];
    const bz = state.boss.p[1];
    const boss = existingBoss ?? spawnClientBoss(activeScene!, bx, bz, state.boss.h, state.boss.m);
    if (boss) {
      boss.netX = bx;
      boss.netZ = bz;
      if (boss.health) {
        boss.health.current = state.boss.h;
        boss.health.max = state.boss.m;
      }
    }
  } else if (existingBoss) {
    removeClientBoss(activeScene!, existingBoss);
  }

  // 3. Sync Loot/XP
  const xpMap = new Map<number, any>();
  for (const x of world.with('isXP')) {
    xpMap.set(x.id!, x);
  }

  state.xp.forEach((xData: any) => {
    const xId = xData.i;
    const xPos = { x: xData.p[0], z: xData.p[1] };
    const xValue = xData.v;

    let xp = xpMap.get(xId);
    if (!xp) {
      xp = spawnXP(activeScene!, xPos.x, xPos.z, xValue);
      if (xp) {
        xp.id = xId;
      }
    }
    if (xp) {
      xp.position.set(xPos.x, 0.5, xPos.z);
      if (xp.transform) {
        xp.transform.position.copy(xp.position);
      }
      xpMap.delete(xId);
    }
  });

  for (const obsoleteXP of xpMap.values()) {
    // XP removed right next to us = we just collected it → play the pickup blip.
    if (localForFx && obsoleteXP.position) {
      const dx = obsoleteXP.position.x - localForFx.position.x;
      const dz = obsoleteXP.position.z - localForFx.position.z;
      if (dx * dx + dz * dz < 3 * 3) playLocalXpPickup();
    }
    if (obsoleteXP.transform) activeScene?.remove(obsoleteXP.transform);
    world.remove(obsoleteXP);
  }

  // 4. Sync Chests
  const chestMap = new Map<number, any>();
  for (const c of world.with('isChest')) {
    chestMap.set(c.id!, c);
  }

  state.chests.forEach((cData: any) => {
    const cId = cData.i;
    const cPos = { x: cData.p[0], z: cData.p[1] };
    const cRarity = cData.r;

    let chest = chestMap.get(cId);
    if (!chest) {
      chest = spawnChest(activeScene!, cPos.x, cPos.z, cRarity);
      if (chest) {
        chest.id = cId;
      }
    }
    if (chest) {
      chest.position.set(cPos.x, 0.4, cPos.z);
      if (chest.transform) {
        chest.transform.position.copy(chest.position);
      }
      chestMap.delete(cId);
    }
  });

  for (const obsoleteChest of chestMap.values()) {
    if (obsoleteChest.transform) activeScene?.remove(obsoleteChest.transform);
    world.remove(obsoleteChest);
  }

  // 5. Sync Global State
  uiState.gameTime = state.gameTime;
  uiState.bossHealth = state.bossHealth;

  // 6. Party roster (names, health, kills, dead/revive) for HUD + scoreboard
  rebuildPartyFromPayload(state.players);
}

/** Listeners for low-rate reliable traffic — these stay on the socket relay. */
function bindRemainingListeners(socket: Socket) {
  // Remote player fired — spawn a visual-only projectile for them.
  socket.on('remote-shoot', (pData: any) => {
    if (!activeScene) return;

    // The host already simulates every player's weapons authoritatively; only
    // non-host clients need these visuals.
    if (uiState.isHost) return;

    const shooterConnId = pData.connectionId;
    if (!shooterConnId || shooterConnId === socket?.id) return; // ignore our own shots

    const remoteEntity = Array.from(world.with('isPlayer')).find(
      (e: any) => e.connectionId === shooterConnId,
    );
    if (!remoteEntity) return; // avatar not synced yet; drop this shot

    import('../systems/WeaponSystem').then(({ fireWeaponRemote }) => {
      fireWeaponRemote(activeScene!, remoteEntity, pData.weaponId, pData.dir);
    });
  });

  // Game events: run ending, chest ceremonies, revives, deaths
  socket.on('game-event', ({ eventType, data }) => {
    switch (eventType) {
      case 'game-over':
        uiState.isGameOver = true;
        submitRunToLeaderboard(); // clients end via this event, not triggerGameOver
        setGameState('GAME_OVER');
        break;
      case 'victory':
        uiState.isGameOver = true;
        uiState.isVictory = true;
        submitRunToLeaderboard();
        setGameState('GAME_OVER');
        break;
      case 'chest-opened':
        // Targeted at THIS client: you touched the chest — roll your rewards
        playChestOpen();
        openChestLocally(data?.rarity || 'common', activeScene ?? undefined);
        break;
      case 'chest-toast':
        if (data?.name && data.connectionId !== socket?.id) {
          showToast(`📦 ${data.name} opened a ${data.rarity || ''} chest`);
        }
        break;
      case 'player-hit': {
        // The host (authoritative for our damage) tells us we were hit — play
        // the exact same feedback single-player does, at our own position.
        const me = world.with('isLocalPlayer', 'position', 'health').first;
        if (me && me.health && me.health.current > 0) {
          me.hitFlashTimer = 0.15;
          uiState.damageFlash++;
          addTrauma(data?.t ?? 0.4);
          playHurt();
          haptics.hit();
          spawnDamageNumber(me.position, data?.d ?? 1, 'player');
          if (data?.kx !== undefined) {
            if (!me.knockback) me.knockback = new THREE.Vector3();
            me.knockback.add(
              new THREE.Vector3(data.kx, 0, data.kz).normalize().multiplyScalar(data.ks ?? 8),
            );
          }
        }
        break;
      }
      case 'player-down':
        if (data?.name) announce(`${data.name} IS DOWN`);
        break;
      case 'player-revived':
        if (data?.name) announce(`${data.name} REVIVED`);
        break;
    }
  });
}

// 4. Send Client updates to Host
export function sendClientUpdate() {
  if (!socket || socket.disconnected || uiState.isHost) return;

  const localPlayer = world.with(
    'isLocalPlayer',
    'position',
    'velocity',
    'aimTarget',
    'input',
    'health',
    'level',
    'score',
  ).first;
  if (localPlayer) {
    const state = {
      seq: ++clientSeq, // receivers keep only the newest (unordered P2P + dual transport)
      position: {
        x: Math.round(localPlayer.position.x * 10) / 10,
        z: Math.round(localPlayer.position.z * 10) / 10,
      },
      velocity: {
        x: Math.round(localPlayer.velocity.x * 10) / 10,
        z: Math.round(localPlayer.velocity.z * 10) / 10,
      },
      aimTarget: {
        x: Math.round((localPlayer.aimTarget?.x || 0) * 10) / 10,
        z: Math.round((localPlayer.aimTarget?.z || 0) * 10) / 10,
      },
      input: {
        x: localPlayer.input?.x || 0,
        y: localPlayer.input?.y || 0,
        isShooting: localPlayer.input?.isShooting || false,
      },
      facingRight: localPlayer.facingRight,
      healthMax: localPlayer.health?.max || 100,
      level: localPlayer.level || 1,
      score: localPlayer.score || 0,
      name: uiState.playerName,
      character: uiState.selectedCharacter,
      weaponSlots: localPlayer.weaponSlots || [],
      // Tell the host when we're in ANY blocking modal so it grants us the
      // co-op safety bubble (no contact damage while we pick upgrades / open
      // a chest / choose a protocol). The host reads this into isUpgrading.
      isUpgrading:
        uiState.showUpgrade ||
        uiState.showChestCeremony ||
        uiState.showProtocolChoice ||
        uiState.gameState === 'PAUSED',
      stats: localPlayer.stats,
    };

    // P2P-first: direct data channel to the host; relay only when it isn't open
    if (!(hostConnId && rtcSendStateTo(hostConnId, 'cu', state))) {
      socket.emit('client-update', { roomCode: uiState.roomCode, state });
    }
  }
}

// --- Ability-state byte encoding for enemy sync ---
function encodeAbilityState(e: Entity): number {
  const kindMap: Record<string, number> = { ranged: 0, dash: 1, phase: 2, trash: 3, shield: 4 };
  const dsMap: Record<string, number> = { idle: 0, windup: 1, dash: 2, recover: 3 };
  const kind = kindMap[e.abilityKind ?? ''] ?? 0;
  const ds = dsMap[e.dashState ?? ''] ?? 0;
  const phased = e.phased ? 1 : 0;
  const tel = e.telegraph !== undefined && e.telegraph > 0 ? 1 : 0;
  return ((kind & 7) << 5) | ((ds & 3) << 3) | (phased << 2) | (tel << 1);
}

function decodeAbilityState(s: number, e: Entity): void {
  const kinds = ['ranged', 'dash', 'phase', 'trash', 'shield'];
  const dss = ['idle', 'windup', 'dash', 'recover'];
  const kindIdx = (s >> 5) & 7;
  const dsIdx = (s >> 3) & 3;
  const phased = ((s >> 2) & 1) === 1;
  const telActive = ((s >> 1) & 1) === 1;
  e.abilityKind = kinds[kindIdx] ?? 'ranged';
  e.dashState = (dss[dsIdx] ?? 'idle') as Entity['dashState'];
  e.phased = phased;
  // On 0->active edge, seed a fresh telegraph timer so the joiner's local sim
  // can count it down. If already active, leave the existing countdown alone
  // (prediction/EnemySystem owns the decrement).
  if (telActive && (!e.telegraph || e.telegraph <= 0)) e.telegraph = 0.5;
  else if (!telActive) e.telegraph = 0;
}

// 5. Send Host updates to Clients
export function sendHostUpdate() {
  if (!socket || socket.disconnected || !uiState.isHost) return;

  // Gather players info
  // NOTE: `facingRight` is intentionally NOT part of this query — it is never
  // assigned on 3D entities and world.with() requires defined components.
  const players = Array.from(
    world.with('isPlayer', 'position', 'velocity', 'health', 'level', 'score'),
  ).map((p: any) => ({
    c: p.connectionId,
    n: p.isLocalPlayer ? uiState.playerName || 'HOST' : p.playerName || 'PLAYER',
    p: [Math.round(p.position.x * 10) / 10, Math.round(p.position.z * 10) / 10],
    v: [Math.round(p.velocity.x * 10) / 10, Math.round(p.velocity.z * 10) / 10],
    f: p.facingRight ? 1 : 0,
    h: Math.round(p.health?.current || 0),
    m: Math.round(p.health?.max || 100),
    l: p.level || 1,
    s: p.score || 0,
    k: p.kills || 0,
    d: p.health && p.health.current <= 0 ? 1 : 0,
    r: Math.round((p.reviveProgress || 0) * 100) / 100,
    x: Math.round(p.xp || 0),
    xm: Math.round(p.xpMax || 100),
    ch: p.isLocalPlayer ? uiState.selectedCharacter : p.character || 'cypher',
  }));

  // Keep the host's own party roster in sync from the same data it broadcasts.
  rebuildPartyFromPayload(players);

  // Gather active enemies (boss excluded — synced separately below)
  const enemies = Array.from(world.with('isEnemy', 'position', 'health'))
    .filter((e: any) => !e.isBoss)
    .map((e: any) => ({
      i: e.id,
      t: e.enemyType,
      p: [Math.round(e.position.x * 10) / 10, Math.round(e.position.z * 10) / 10],
      h: Math.round(e.health?.current || 0),
      f: e.facingRight ? 1 : 0,
      fl: e.hitFlashTimer > 0 ? 1 : 0,
      s: encodeAbilityState(e),
    }));

  // Gather active XP gems
  const xp = Array.from(world.with('isXP', 'position')).map((x: any) => ({
    i: x.id,
    p: [Math.round(x.position.x * 10) / 10, Math.round(x.position.z * 10) / 10],
    v: x.xpValue || 5,
  }));

  // Gather enemy projectiles (boss glitch ring) so clients can SEE and dodge
  // the bullets that damage them
  const ep = Array.from(world.with('isEnemyProjectile', 'position', 'velocity')).map((p: any) => ({
    i: p.id,
    p: [Math.round(p.position.x * 10) / 10, Math.round(p.position.z * 10) / 10],
    v: [Math.round(p.velocity.x * 10) / 10, Math.round(p.velocity.z * 10) / 10],
    k: p.color ?? 0xff3333,
  }));

  // Gather active chests
  const chests = Array.from(world.with('isChest', 'position', 'chestRarity')).map((c: any) => ({
    i: c.id,
    p: [Math.round(c.position.x * 10) / 10, Math.round(c.position.z * 10) / 10],
    r: c.chestRarity || 'common',
  }));

  // Gather boss (single entity, or null when not present)
  const bossE = world.with('isBoss', 'position', 'health').first;
  const boss = bossE
    ? {
        p: [Math.round(bossE.position.x * 10) / 10, Math.round(bossE.position.z * 10) / 10],
        h: Math.round(bossE.health?.current ?? 0),
        m: Math.round(bossE.health?.max ?? 1),
      }
    : null;

  const state = {
    seq: ++hostSeq, // receivers keep only the newest (unordered P2P + dual transport)
    players,
    enemies,
    xp,
    ep,
    chests,
    boss,
    gameTime: uiState.gameTime,
    bossHealth: uiState.bossHealth,
  };

  // P2P-first: push the snapshot straight to every client with an open data
  // channel. Only touch the relay if at least one client is still on it — the
  // seq number lets P2P clients discard the duplicate relay copy.
  let anyOnRelay = false;
  for (const connId of remotePlayers.keys()) {
    if (!rtcSendStateTo(connId, 'hu', state)) anyOnRelay = true;
  }
  if (anyOnRelay || remotePlayers.size === 0) {
    socket.emit('host-update', { roomCode: uiState.roomCode, state });
  }
}

// 6. Broadcast Shoot Event
export function broadcastShoot(projectileData: {
  weaponId: string;
  ownerId: number;
  dir: { x: number; z: number };
}) {
  if (!socket || socket.disconnected) return;
  socket.emit('shoot-event', {
    roomCode: uiState.roomCode,
    projectileData: {
      ...projectileData,
      connectionId: socket.id,
    },
  });
}

// 7. Broadcast game events to the whole room (host only)
export function broadcastGameEvent(
  eventType: 'game-over' | 'victory' | 'chest-toast' | 'player-down' | 'player-revived',
  data: any = {},
) {
  if (!socket || socket.disconnected || !uiState.isHost) return;
  socket.emit('sync-game-event', {
    roomCode: uiState.roomCode,
    eventType,
    data,
  });
}

// 8. Targeted event: host → one specific client (chest ceremonies etc.)
export function sendDirectEvent(targetConnId: string, eventType: string, data: any = {}) {
  if (!socket || socket.disconnected || !uiState.isHost) return;
  socket.emit('direct-event', {
    roomCode: uiState.roomCode,
    targetId: targetConnId,
    eventType,
    data,
  });
}

// --- NETWORK SMOOTHING (clients) ---
// Remote entities receive positions at ~30Hz; snapping them there looks
// stuttery. Instead updates write netX/netZ targets and this system eases
// positions toward them every frame.
const NET_LERP_RATE = 12; // higher = snappier, lower = floatier

export function NetSmoothingSystem(dt: number) {
  if (!uiState.isMultiplayer || uiState.isHost) return;
  const t = Math.min(1, dt * NET_LERP_RATE);

  const kickDecay = Math.exp(-6 * dt);

  for (const e of world.with('netX', 'position')) {
    // Enemy prediction owns their position (EnemySystem reconciliation + fxKick).
    // Bosses still need smoothing (they have a Three.js transform).
    if (e.isEnemy && !e.isBoss) continue;

    const dx = (e.netX ?? e.position.x) - e.position.x;
    const dz = (e.netZ ?? e.position.z) - e.position.z;
    if (dx * dx + dz * dz > 15 * 15) {
      e.position.x = e.netX ?? e.position.x;
      e.position.z = e.netZ ?? e.position.z;
    } else {
      e.position.x += dx * t;
      e.position.z += dz * t;
    }

    if (e.fxKickX || e.fxKickZ) {
      e.position.x += (e.fxKickX ?? 0) * dt;
      e.position.z += (e.fxKickZ ?? 0) * dt;
      e.fxKickX = (e.fxKickX ?? 0) * kickDecay;
      e.fxKickZ = (e.fxKickZ ?? 0) * kickDecay;
      if (Math.abs(e.fxKickX) < 0.05 && Math.abs(e.fxKickZ) < 0.05) {
        e.fxKickX = 0;
        e.fxKickZ = 0;
      }
    }

    if (e.transform) {
      e.transform.position.x = e.position.x;
      e.transform.position.z = e.position.z;
    }
  }
}
