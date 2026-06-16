import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';
import { world } from './world';
import { uiState } from './UIState.svelte';
import { setGameState } from './GameState';
import { spawnPlayer, spawnEnemy, spawnXP } from './factories';
import { spawnChest } from '../systems/ChestSystem';
import { removeBody } from './RapierWorld';
import { WEAPONS, getWeaponStatsAtLevel } from './WeaponRegistry';

let socket: Socket | null = null;
let activeScene: THREE.Scene | null = null;

// Map to track remote player entities: connectionId -> entity
export const remotePlayers = new Map<string, any>();

// Helper to determine socket URL
const getSocketUrl = (): string => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) {
    return 'http://localhost:3001';
  }
  const envUrl = import.meta.env.VITE_SIGNALING_SERVER_URL;
  if (!envUrl) {
    console.warn('[Network] VITE_SIGNALING_SERVER_URL is not set. Falling back to relative origin replace.');
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

  socket.emit('client-join-room', { roomCode });
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
    alert(`Failed to join room: ${message}`);
    disconnectNetwork();
  });

  socket.on('player-joined', ({ playerId }) => {
    console.log(`[Network] Player joined: ${playerId}`);
    uiState.networkStatus = 'connected';

    // Spawn player avatar on host side
    if (activeScene) {
      // Spawn at offset from center
      const offsetPos = (remotePlayers.size + 1) * 3;
      spawnPlayer(activeScene, false, playerId, offsetPos, offsetPos);
      // Wait, spawnPlayer returns nothing, but it adds it to world. Let's find it.
      const playerEntity = Array.from(world.with('isPlayer')).find(
        (e: any) => e.connectionId === playerId
      );
      if (playerEntity) {
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
    alert('Host disconnected. Returning to Main Menu.');
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
        const local = world.with('isLocalPlayer', 'health').first;
        if (local && local.health) {
          local.health.current = pHealth.current;
          local.health.max = pHealth.max;
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
    const enemyMap = new Map<number, any>();
    for (const e of world.with('isEnemy')) {
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
  });

  // Remote shoots visual projectile
  socket.on('remote-shoot', (pData) => {
    if (!activeScene) return;
    
    // Play sound and spawn visual projectile for remote player
    // Call fireWeapon directly on client side for remote player representation
    const remoteEntity = Array.from(world.with('isPlayer')).find(
      (e: any) => e.connectionId === pData.connectionId || e.id === pData.ownerId
    );
    
    if (remoteEntity) {
      // Find remote player's weapon entity matching the projectile weapon ID
      let weapon = Array.from(world.with('isWeapon', 'ownerId')).find(
        (w: any) => w.ownerId === remoteEntity.id && w.weaponId === pData.weaponId
      );

      // If remote player's weapon slot is not created yet, spawn a mock weapon entity
      if (!weapon) {
        const stats = WEAPONS[pData.weaponId];
        const tierStats = getWeaponStatsAtLevel(pData.weaponId, 1)!;
        weapon = world.add({
          isWeapon: true,
          weaponId: pData.weaponId,
          ownerId: remoteEntity.id,
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          weapon: {
            cooldownTimer: 0,
            fireRate: tierStats.cooldown,
            damage: tierStats.damage,
            bulletSpeed: stats.baseSpeed,
            bulletColor: stats.color,
            bulletLifetime: stats.baseLifetime,
            category: stats.category,
            bulletWidth: stats.bulletWidth,
            bulletLength: stats.bulletLength,
            visualStyle: stats.visualStyle,
            bulletCount: tierStats.projectiles,
            bulletSpread: stats.baseSpread,
            knockback: stats.baseKnockback,
            bulletPierce: tierStats.pierce,
            bulletExplodeRadius: stats.explodeRadius,
          }
        });
      }

      // Temporarily set remote player's aim target to match the direction of travel
      if (!remoteEntity.aimTarget) remoteEntity.aimTarget = new THREE.Vector3();
      remoteEntity.aimTarget.copy(remoteEntity.position).add(
        new THREE.Vector3(pData.dir.x, 0, pData.dir.z).normalize().multiplyScalar(10)
      );

      // Run local visual firing for remote player
      // Import dynamically to avoid circular references
      import('../systems/WeaponSystem').then(({ fireWeaponRemote }) => {
        fireWeaponRemote(activeScene!, remoteEntity, pData.weaponId, pData.dir);
      });
    }
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

  const localPlayer = world.with('isLocalPlayer', 'position', 'velocity', 'aimTarget', 'input', 'health', 'level', 'score').first;
  if (localPlayer) {
    socket.emit('client-update', {
      roomCode: uiState.roomCode,
      state: {
        position: { x: Math.round(localPlayer.position.x * 10) / 10, z: Math.round(localPlayer.position.z * 10) / 10 },
        velocity: { x: Math.round(localPlayer.velocity.x * 10) / 10, z: Math.round(localPlayer.velocity.z * 10) / 10 },
        aimTarget: { x: Math.round((localPlayer.aimTarget?.x || 0) * 10) / 10, z: Math.round((localPlayer.aimTarget?.z || 0) * 10) / 10 },
        input: { x: localPlayer.input?.x || 0, y: localPlayer.input?.y || 0, isShooting: localPlayer.input?.isShooting || false },
        facingRight: localPlayer.facingRight,
        health: { current: localPlayer.health?.current || 100, max: localPlayer.health?.max || 100 },
        level: localPlayer.level || 1,
        score: localPlayer.score || 0,
        weaponSlots: localPlayer.weaponSlots || [],
      },
    });
  }
}

// 5. Send Host updates to Clients
export function sendHostUpdate() {
  if (!socket || socket.disconnected || !uiState.isHost) return;

  // Gather players info
  const players = Array.from(world.with('isPlayer', 'position', 'velocity', 'facingRight', 'health', 'level', 'score')).map((p: any) => ({
    c: p.connectionId,
    p: [Math.round(p.position.x * 10) / 10, Math.round(p.position.z * 10) / 10],
    v: [Math.round(p.velocity.x * 10) / 10, Math.round(p.velocity.z * 10) / 10],
    f: p.facingRight ? 1 : 0,
    h: Math.round(p.health?.current || 0),
    m: Math.round(p.health?.max || 100),
    l: p.level || 1,
    s: p.score || 0,
  }));

  // Gather active enemies
  const enemies = Array.from(world.with('isEnemy', 'position', 'health', 'facingRight')).map((e: any) => ({
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

  socket.emit('host-update', {
    roomCode: uiState.roomCode,
    state: {
      players,
      enemies,
      xp,
      chests,
      gameTime: uiState.gameTime,
      bossHealth: uiState.bossHealth,
    },
  });
}

// 6. Broadcast Shoot Event
export function broadcastShoot(projectileData: { weaponId: string; ownerId: number; dir: { x: number; z: number } }) {
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
