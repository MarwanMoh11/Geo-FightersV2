/**
 * CoopSystem — co-op life cycle: ghosts, downs, and revives. HOST-authoritative.
 *
 * Rules:
 * - A player at 0 HP becomes a ghost: they keep moving (spectator roam) but
 *   can't fire (WeaponSystem gate), can't be hit (CollisionSystem gate), can't
 *   collect loot (LootSystem gate) or open chests (ChestSystem gate).
 * - An ALIVE teammate standing within REVIVE_RADIUS of a ghost channels a
 *   revive: progress fills over REVIVE_TIME seconds and decays when nobody is
 *   near. On completion the ghost returns at REVIVE_HP_FRACTION of max HP with
 *   brief i-frames.
 * - The run only ends when EVERY player is down (CollisionSystem already
 *   checks that on each death).
 */

import { world } from '../core/world';
import { uiState, announce } from '../core/UIState.svelte.ts';
import { broadcastGameEvent } from '../core/network';
import { playLevelUp } from '../core/audio';

const REVIVE_RADIUS_SQ = 3.0 * 3.0;
const REVIVE_TIME = 3.0; // seconds of proximity to bring a teammate back
const REVIVE_DECAY = 0.5; // progress lost per second when nobody is near
const REVIVE_HP_FRACTION = 0.5;
const REVIVE_IFRAMES = 2.0;

const _players: any[] = [];

/**
 * Per-frame co-op tick: track ghost states, decay revive progress when no
 * reviver is nearby, and complete revives when the channel finishes.
 *
 * @param {number} dt - delta time since last frame in seconds
 */
export function CoopSystem(dt: number) {
  // Solo runs have no one to revive you — co-op only.
  if (!uiState.isMultiplayer || !uiState.isHost) return;

  _players.length = 0;
  for (const p of world.with('isPlayer', 'position', 'health')) {
    _players.push(p);
  }
  if (_players.length < 2) return;

  for (const ghost of _players) {
    const isDead = ghost.health.current <= 0;

    // Announce downs exactly once per death
    if (isDead && !ghost._downAnnounced) {
      ghost._downAnnounced = true;
      ghost.reviveProgress = 0;
      const name = ghost.isLocalPlayer
        ? uiState.playerName || 'HOST'
        : ghost.playerName || 'PLAYER';
      announce(`${name} IS DOWN`);
      broadcastGameEvent('player-down', { name });
    }
    if (!isDead) {
      ghost._downAnnounced = false;
      continue;
    }

    // Is an alive teammate close enough to channel the revive?
    let reviverNear = false;
    for (const p of _players) {
      if (p === ghost || p.health.current <= 0) continue;
      const dx = p.position.x - ghost.position.x;
      const dz = p.position.z - ghost.position.z;
      if (dx * dx + dz * dz < REVIVE_RADIUS_SQ) {
        reviverNear = true;
        break;
      }
    }

    if (reviverNear) {
      ghost.reviveProgress = (ghost.reviveProgress || 0) + dt / REVIVE_TIME;
      if (ghost.reviveProgress >= 1) {
        // Back up! Half health + brief i-frames so they aren't chain-downed.
        ghost.health.current = Math.max(1, Math.round(ghost.health.max * REVIVE_HP_FRACTION));
        ghost.invulnTimer = REVIVE_IFRAMES;
        ghost.reviveProgress = 0;
        ghost._downAnnounced = false;
        const name = ghost.isLocalPlayer
          ? uiState.playerName || 'HOST'
          : ghost.playerName || 'PLAYER';
        announce(`${name} REVIVED`);
        broadcastGameEvent('player-revived', { name });
        playLevelUp();
      }
    } else {
      ghost.reviveProgress = Math.max(0, (ghost.reviveProgress || 0) - REVIVE_DECAY * dt);
    }
  }
}
