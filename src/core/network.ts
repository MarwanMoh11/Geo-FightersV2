import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';
import { world } from './world';
import { uiState, showToast } from './UIState.svelte';
import { setGameState } from './GameState';
import { spawnPlayer, spawnEnemy, spawnXP } from './factories';
import { spawnChest } from '../systems/ChestSystem';
import { spawnClientBoss, removeClientBoss } from '../systems/FinaleBoss';
import { removeBody } from './RapierWorld';
import { playLevelUp } from './audio';
import { triggerLevelUp } from '../systems/UpgradeSystem';

let socket: Socket | null = null;
let activeScene: THREE.Scene | null = null;

// Map to track remote player entities: connectionId -> entity
export const remotePlayers = new Map<string, any>();

// Rebuild the live party roster (used by the co-op teammate HUD) from a host/client
// players payload. Each entry: { c: connId, n: name, h: hp, m: maxHp, l: level }.
function rebuildPartyFromPayload(players: any[]) {
  uiState.party = players.map((p: any) => ({
    connectionId: p.c,
    name: p.n || 'PLAYER',
    hp: Math.round(p.h ?? 0),
    maxHp: Math.round(p.m ?? 100),
    level: p.l || 1,
    isLocal: p.c === socket?.id,
  }));
}

// Helper to determine socket URL
const getSocketUrl = (): string => {
  if (uiState.customServerUrl) {
    return uiState.customServerUrl;
  }
  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) {
    return 'http://localhost:3001';
  }
  const envUrl = import.meta.env.VITE_SIGNALING_SERVER_URL;
  if (!envUrl) {
    console.warn(
      '[Network] VITE_SIGNALING_SERVER_URL is not set. Falling back to relative origin replace.',
    );
  }
  return (envUrl as string) || window.location.origin.replace('5173', '3001');
};

export function setNetworkScene(scene: THREE.Scene) {
  activeScene = scene;
}

export function isConnected(): boolean {
  return socket !== null && socket.connected;
}

export function getSocket(): Socket | null {
  return socket;
}

// 1. Host Creates Room
export function hostRoom() {
  uiState.networkStatus = 'connecting';

  if (!socket) {
    socket = io(getSocketUrl());
    setupSocketListeners();
  }

  socket.emit('host-create-room');
}

// 2. Client Joins Room
export function joinRoom(roomCode: string) {
  uiState.networkStatus = 'connecting';

  if (!socket) {
    socket = io(getSocketUrl());
    setupSocketListeners();
  }

  socket.emit('client-join-room', { roomCode, name: uiState.playerName });
}

// 3. Disconnect from room/server
export function disconnectNetwork() {
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

function setupSocketListeners() {
  if (!socket) return;

  socket.on('connect', () => {
    console.log('[Network] Connected to signaling server');
  });

  socket.on('room-created', ({ roomCode }) => {
    uiState.isMultiplayer = true;
    uiState.isHost = true;
    uiState.roomCode = roomCode;
    uiState.networkStatus = 'waiting_for_players';
    console.log(`[Network] Room created: ${roomCode} (Hosting)`);

    // Set local player connection ID to socket ID
    const local = world.with('isLocalPlayer').first;
    if (local && socket) {
      local.connectionId = socket.id;
    }
  });

  socket.on('joined-room', ({ roomCode }) => {
    uiState.isMultiplayer = true;
    uiState.isHost = false;
    uiState.roomCode = roomCode;
    uiState.networkStatus = 'connected';
    console.log(`[Network] Joined room: ${roomCode} (Client)`);

    // Set local player connection ID to socket ID
    const local = world.with('isLocalPlayer').first;
    if (local && socket) {
      local.connectionId = socket.id;
    }

    // Start game for client
    setGameState('PLAYING');
  });

  socket.on('join-error', ({ message }) => {
    showToast(`Failed to join room: ${message}`);
    disconnectNetwork();
  });

  socket.on('player-joined', ({ playerId, name }) => {
    console.log(`[Network] Player joined: ${playerId} (${name || 'PLAYER'})`);
    uiState.networkStatus = 'connected';

    // Spawn player avatar on host side
    if (activeScene) {
      // Spawn at offset from center
      const offsetPos = (remotePlayers.size + 1) * 3;
      spawnPlayer(activeScene, false, playerId, offsetPos, offsetPos);
      // Wait, spawnPlayer returns nothing, but it adds it to world. Let's find it.
      const playerEntity = Array.from(world.with('isPlayer')).find(
        (e: any) => e.connectionId === playerId,
      );
      if (playerEntity) {
        playerEntity.playerName = name || 'PLAYER';
        remotePlayers.set(playerId, playerEntity);
        uiState.remotePlayersCount = remotePlayers.size;
      }
    }

    // Start game for host
    setGameState('PLAYING');
  });

  socket.on('player-left', ({ playerId }) => {
    console.log(`[Network] Player left: ${playerId}`);
    removeRemotePlayer(playerId);
  });

  socket.on('host-disconnected', () => {
    showToast('Host disconnected. Returning to Main Menu.');
    disconnectNetwork();
    setGameState('MENU');
  });

  // Client updates on Host
  socket.on('client-state-update', ({ playerId, state }) => {
    let player = remotePlayers.get(playerId);
    if (!player) {
      // If we somehow missed the join event, spawn them now
      if (activeScene) {
        spawnPlayer(activeScene, false, playerId, state.position.x, state.position.z);
        player = Array.from(world.with('isPlayer')).find((e: any) => e.connectionId === playerId);
        if (player) {
          remotePlayers.set(playerId, player);
          uiState.remotePlayersCount = remotePlayers.size;
        }
      }
    }

    if (player) {
      // Update inputs, aiming targets, and stats
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
      if (player.health) {
        player.health.current = state.health.current;
        player.health.max = state.health.max;
      }
      player.level = state.level;
      player.score = state.score;
      player.isUpgrading = state.isUpgrading;
      if (state.name) player.playerName = state.name;
      if (state.stats) {
        player.stats = state.stats;
      }

      // Update inventory weapon slots
      if (state.weaponSlots) {
        player.weaponSlots = state.weaponSlots;
      }
    }
  });

  // Host updates on Client
  socket.on('host-state-update', ({ state }) => {
    if (!activeScene) return;

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
        // This is the local player on the client: update health/XP from Host authoritative state
        const local = world.with('isLocalPlayer', 'health', 'level').first;
        if (local) {
          if (local.health) {
            local.health.current = pHealth.current;
            local.health.max = pHealth.max;
          }
          if (pLevel > (local.level || 1)) {
            // Host determined this client leveled up! Trigger local Svelte upgrade modal.
            local.level = pLevel;
            local.xp = 0;
            local.xpMax = Math.floor((local.xpMax || 100) * 1.2);
            playLevelUp();
            triggerLevelUp();
          }
        }
        return;
      }

      // Remote player on client
      let player = remotePlayers.get(pConnId);
      if (!player) {
        spawnPlayer(activeScene!, false, pConnId, pPos.x, pPos.z);
        player = Array.from(world.with('isPlayer')).find((e: any) => e.connectionId === pConnId);
        if (player) {
          remotePlayers.set(pConnId, player);
          uiState.remotePlayersCount = remotePlayers.size;
        }
      }

      if (player) {
        player.position.set(pPos.x, 0.5, pPos.z);
        player.velocity.set(pVel.x, 0, pVel.z);
        player.facingRight = pFacingRight;
        if (player.health) {
          player.health.current = pHealth.current;
          player.health.max = pHealth.max;
        }
        player.level = pLevel;
        player.score = pScore;
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
    // Skip the boss here — it is flagged `isEnemy` but synced separately (section 2b).
    // Without this guard the boss would never match a host enemy entry and would be
    // despawned as "obsolete" on every frame.
    const enemyMap = new Map<number, any>();
    for (const e of world.with('isEnemy')) {
      if (e.isBoss) continue;
      enemyMap.set(e.id!, e);
    }

    state.enemies.forEach((eData: any) => {
      const eId = eData.i;
      const eType = eData.t;
      const ePos = { x: eData.p[0], z: eData.p[1] };
      const eHealth = { current: eData.h, max: eData.h };
      const eFacingRight = eData.f === 1;
      const eHitFlashTimer = eData.fl === 1 ? 0.1 : 0;

      let enemy = enemyMap.get(eId);
      if (!enemy) {
        // Spawn local representation
        enemy = spawnEnemy(activeScene!, ePos.x, ePos.z, eType);
        if (enemy) {
          enemy.id = eId;
        }
      }

      if (enemy) {
        enemy.position.set(ePos.x, 0.5, ePos.z);
        if (enemy.transform) {
          enemy.transform.position.copy(enemy.position);
        }
        if (enemy.health) {
          enemy.health.current = eHealth.current;
          enemy.health.max = eHealth.max;
        }
        enemy.facingRight = eFacingRight;
        enemy.hitFlashTimer = eHitFlashTimer;

        // Remove from tracking map so we know it was handled
        enemyMap.delete(eId);
      }
    });

    // Despawn enemies no longer mentioned by Host
    for (const obsoleteEnemy of enemyMap.values()) {
      if (obsoleteEnemy.transform) activeScene?.remove(obsoleteEnemy.transform);
      if (obsoleteEnemy.rigidBody) removeBody(obsoleteEnemy.rigidBody);
      world.remove(obsoleteEnemy);
    }

    // 2b. Sync Boss (host-authoritative; visual mirror on the client)
    const existingBoss = world.with('isBoss', 'position', 'health').first;
    if (state.boss) {
      const bx = state.boss.p[0];
      const bz = state.boss.p[1];
      const boss =
        existingBoss ?? spawnClientBoss(activeScene!, bx, bz, state.boss.h, state.boss.m);
      if (boss) {
        boss.position.set(bx, 0, bz);
        if (boss.transform) boss.transform.position.copy(boss.position);
        if (boss.health) {
          boss.health.current = state.boss.h;
          boss.health.max = state.boss.m;
        }
      }
    } else if (existingBoss) {
      // Host no longer reports a boss (killed or escaped) — remove the mirror.
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

    // 6. Party roster (names + health) for the co-op teammate HUD
    rebuildPartyFromPayload(state.players);
  });

  // Remote player fired — spawn a visual-only projectile for them.
  socket.on('remote-shoot', (pData: any) => {
    if (!activeScene) return;

    // The host already simulates every player's weapons authoritatively (it owns the
    // real projectiles + damage), so rendering remote-shoot visuals there would just
    // double every client's bullets. Only non-host clients need these visuals.
    if (uiState.isHost) return;

    // Match the shooter strictly by connectionId. Entity `id`s are assigned per-client
    // and collide across machines (every player's local avatar tends to be id 1), so the
    // old `|| e.id === pData.ownerId` fallback frequently matched the WRONG entity (often
    // our own local player) — which is why teammates' bullets never appeared.
    const shooterConnId = pData.connectionId;
    if (!shooterConnId || shooterConnId === socket?.id) return; // ignore our own shots

    const remoteEntity = Array.from(world.with('isPlayer')).find(
      (e: any) => e.connectionId === shooterConnId,
    );
    if (!remoteEntity) return; // avatar not synced yet; drop this shot

    // Import dynamically to avoid circular references
    import('../systems/WeaponSystem').then(({ fireWeaponRemote }) => {
      fireWeaponRemote(activeScene!, remoteEntity, pData.weaponId, pData.dir);
    });
  });

  // Game events (loot collection, boss spawns, victory/gameover)
  socket.on('game-event', ({ eventType }) => {
    if (eventType === 'game-over') {
      setGameState('GAME_OVER');
      uiState.isGameOver = true;
    } else if (eventType === 'victory') {
      setGameState('GAME_OVER');
      uiState.isGameOver = true;
      uiState.isVictory = true;
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
    socket.emit('client-update', {
      roomCode: uiState.roomCode,
      state: {
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
        health: {
          current: localPlayer.health?.current || 100,
          max: localPlayer.health?.max || 100,
        },
        level: localPlayer.level || 1,
        score: localPlayer.score || 0,
        name: uiState.playerName,
        weaponSlots: localPlayer.weaponSlots || [],
        isUpgrading: uiState.showUpgrade || uiState.gameState === 'PAUSED',
        stats: localPlayer.stats,
      },
    });
  }
}

// 5. Send Host updates to Clients
export function sendHostUpdate() {
  if (!socket || socket.disconnected || !uiState.isHost) return;

  // Gather players info
  // NOTE: `facingRight` is intentionally NOT part of this query. It is an optional
  // field that is never assigned on entities (3D models face via transform.rotation),
  // and world.with() requires every listed component to be defined. Including it here
  // filtered out ALL players, so the host transmitted an empty player list and clients
  // never saw the host or other players.
  const players = Array.from(
    world.with('isPlayer', 'position', 'velocity', 'health', 'level', 'score'),
  ).map((p: any) => ({
    c: p.connectionId,
    // Host's own name lives in uiState; remote players carry it on the entity.
    n: p.isLocalPlayer ? uiState.playerName || 'HOST' : p.playerName || 'PLAYER',
    p: [Math.round(p.position.x * 10) / 10, Math.round(p.position.z * 10) / 10],
    v: [Math.round(p.velocity.x * 10) / 10, Math.round(p.velocity.z * 10) / 10],
    f: p.facingRight ? 1 : 0,
    h: Math.round(p.health?.current || 0),
    m: Math.round(p.health?.max || 100),
    l: p.level || 1,
    s: p.score || 0,
  }));

  // Keep the host's own party roster in sync from the same data it broadcasts.
  rebuildPartyFromPayload(players);

  // Gather active enemies
  // NOTE: `facingRight` is intentionally NOT part of this query (see players note above).
  // Including it filtered out ALL enemies, so the host sent an empty enemy list and the
  // joining client never saw any enemies.
  // The boss is also flagged `isEnemy`, but it has no `enemyType` and a bespoke model,
  // so it is excluded here and synced separately via the `boss` field below.
  const enemies = Array.from(world.with('isEnemy', 'position', 'health'))
    .filter((e: any) => !e.isBoss)
    .map((e: any) => ({
      i: e.id,
      t: e.enemyType,
      p: [Math.round(e.position.x * 10) / 10, Math.round(e.position.z * 10) / 10],
      h: Math.round(e.health?.current || 0),
      f: e.facingRight ? 1 : 0,
      fl: e.hitFlashTimer > 0 ? 1 : 0,
    }));

  // Gather active XP gems
  const xp = Array.from(world.with('isXP', 'position')).map((x: any) => ({
    i: x.id,
    p: [Math.round(x.position.x * 10) / 10, Math.round(x.position.z * 10) / 10],
    v: x.xpValue || 5,
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

  socket.emit('host-update', {
    roomCode: uiState.roomCode,
    state: {
      players,
      enemies,
      xp,
      chests,
      boss,
      gameTime: uiState.gameTime,
      bossHealth: uiState.bossHealth,
    },
  });
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

// 7. Broadcast game ending events
export function broadcastGameEvent(eventType: 'game-over' | 'victory', data: any = {}) {
  if (!socket || socket.disconnected || !uiState.isHost) return;
  socket.emit('sync-game-event', {
    roomCode: uiState.roomCode,
    eventType,
    data,
  });
}
