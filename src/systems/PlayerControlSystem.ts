import { world } from '../core/world';
import * as THREE from 'three';
import { uiState } from '../core/UIState.svelte.ts';

const BASE_PLAYER_SPEED = 5.5;
const KNOCKBACK_DECAY = 7.0; // higher = recovers control faster

const _inputVector = new THREE.Vector3();

/**
 * Per-frame player movement tick: read the input component, apply speed buffs
 * and debuffs, and layer decaying knockback on top of player-controlled velocity.
 *
 * @param {number} dt - delta time since last frame in seconds
 */
export function PlayerControlSystem(dt: number) {
  // Remote players are never *driven* here, on either side. Each client owns its
  // own position and reports it; the network layer eases their body toward that
  // report (NetSmoothingSystem on a client, HostPlayerSmoothingSystem on the
  // host). Deriving their movement from replicated input instead meant:
  //   - on a client, recomputing velocity from an input component nothing fills,
  //     zeroing it — and RenderSystem only re-aims a rig while it is moving, so
  //     teammates froze pointing whichever way they happened to be facing;
  //   - on the host, EXTRAPOLATING them forward on their last-known input
  //     between packets. Contact damage is resolved against that body, so every
  //     overshoot became a hit the joiner never saw coming.
  const remoteIsMirror = uiState.isMultiplayer;

  for (const entity of world.with('isPlayer', 'velocity', 'input', 'stats')) {
    // FIX: Guard clause
    if (!entity.input) continue;

    // Tick post-hit invulnerability window. This must run for EVERY player,
    // including mirrors — the host stamps invulnTimer on remote players when
    // they take contact damage, and if nothing decremented it they would be
    // permanently immune after their first hit.
    if (entity.invulnTimer && entity.invulnTimer > 0) {
      entity.invulnTimer -= dt;
    }

    if (remoteIsMirror && !entity.isLocalPlayer) continue;

    // Jacked into a breach: the fighter kneels at the terminal — no movement
    // (BreachSystem maintains the shield; the mini-game owns the keys).
    // `isDiving` is checked for EVERY player, not just the local one: in co-op
    // the host simulates a remote teammate's body while they are in cyberspace,
    // and their last-sent input must not keep walking it around the arena.
    // A downed player is never "diving" — going down ends the session. Without
    // the health check a stale isDiving (from a client that dropped mid-dive)
    // would pin that body in place permanently, including after a revive.
    const alive = !entity.health || entity.health.current > 0;
    if ((entity.isLocalPlayer && uiState.breach) || (entity.isDiving && alive)) {
      entity.velocity.set(0, 0, 0);
      continue;
    }

    // Read from Input Component
    _inputVector.set(entity.input.x, 0, entity.input.y);

    // Apply Speed with passive bonus
    let speedMult = entity.stats?.moveSpeed || 1.0;
    // Map 1 Velocity Shrine: local-player speed surge
    if (entity.isLocalPlayer && uiState.shrineSpeedTimer > 0) speedMult *= 1.25;
    if (uiState.overloadActive) {
      if (uiState.selectedCharacter === 'rail') {
        speedMult = 0;
      } else if (uiState.selectedCharacter === 'lash' || uiState.selectedCharacter === 'ghost') {
        speedMult *= 1.5; // sprint ults: Lash's static field, Ghost's phase-walk
      }
    }
    if (uiState.insideDefragZone) {
      speedMult *= 1.3;
    }
    entity.velocity.copy(_inputVector.multiplyScalar(BASE_PLAYER_SPEED * speedMult));

    // Layer decaying knockback on top of input so hits physically push the
    // player without permanently stealing control
    if (entity.knockback && entity.knockback.lengthSq() > 0.01) {
      entity.velocity.add(entity.knockback);
      entity.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DECAY * dt));
    }
  }
}
