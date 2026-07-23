import { world } from '../core/world';
import * as THREE from 'three';
import { spawnEnemy, EnemyType, spawnEnemyProjectile } from '../core/factories';

const RANGED_RANGE_SQ = 7.5 * 7.5;
const RANGED_MIN_SQ = 4.5 * 4.5;
const RANGED_COOLDOWN = 2.2;
const RANGED_WINDUP = 0.45;
const RANGED_BOLT_SPEED = 6.0;
const RANGED_BOLT_DAMAGE = 7;
const BULLET_COLOR = 0xff44aa;
const SPITTER_LOB_SPEED = 9.0;
const SPITTER_LOB_DURATION = 0.7;
const DASH_WINDUP = 0.45;
const DASH_DURATION = 0.28;
const DASH_RECOVER = 0.6;
const DASH_SPEED = 13.0;
const DASH_COOLDOWN_MIN = 1.6;
const DASH_COOLDOWN_MAX = 3.0;
const PHASE_DURATION = 1.0;
const PHASE_COOLDOWN_MIN = 3.5;
const PHASE_COOLDOWN_MAX = 5.5;
const TRASH_INTERVAL = 5.0;
const TRASH_BURST = 4;
const AURA_SHIELD_MAX = 60;
const AURA_REGEN = 30;
const AURA_GRANT = 0;
const ABILITY_ENEMY_CAP = 2500;

const _abled: any[] = [];
const _players: any[] = [];
const _tmp = new THREE.Vector3();

export function EnemyAbilitySystem(dt: number, scene: THREE.Scene) {
  _players.length = 0;
  for (const p of world.with('isPlayer', 'position', 'health')) {
    if (p.health && p.health.current > 0) _players.push(p);
  }

  _abled.length = 0;
  for (const e of world.with('abilityKind', 'position', 'health')) {
    if (e.health && e.health.current > 0) _abled.push(e);
  }

  for (let i = 0; i < _abled.length; i++) {
    const e = _abled[i];

    if (e.telegraph !== undefined && e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraph < 0) e.telegraph = 0;
    }

    switch (e.abilityKind) {
      case 'ranged': {
        let nearestPlayer: any = null;
        let minDistSq = Infinity;
        for (let p = 0; p < _players.length; p++) {
          const pl = _players[p];
          const dx = pl.position.x - e.position.x;
          const dz = pl.position.z - e.position.z;
          const dsq = dx * dx + dz * dz;
          if (dsq < minDistSq) {
            minDistSq = dsq;
            nearestPlayer = pl;
          }
        }

        if (e.lobbing && e.lobbing > 0) {
          e.lobbing -= dt;
          if (e.lobbing <= 0) {
            e.lobbing = 0;
            e.abilityTimer = RANGED_COOLDOWN + Math.random() * 0.8;
          }
        }

        if (!(e.lobbing && e.lobbing > 0)) {
          e.abilityTimer -= dt;

          if (e.abilityTimer <= 0) {
            if (e.winding) {
              if (e.enemyType === 'spitter') {
                if (nearestPlayer) {
                  _tmp.set(
                    nearestPlayer.position.x - e.position.x + nearestPlayer.velocity.x * 0.15,
                    0,
                    nearestPlayer.position.z - e.position.z + nearestPlayer.velocity.z * 0.15,
                  );
                  _tmp.normalize();
                  e.velocity.x = _tmp.x * SPITTER_LOB_SPEED;
                  e.velocity.z = _tmp.z * SPITTER_LOB_SPEED;
                  e.lobbing = SPITTER_LOB_DURATION;
                }
              } else if (nearestPlayer) {
                _tmp.set(
                  nearestPlayer.position.x - e.position.x + nearestPlayer.velocity.x * 0.15,
                  0,
                  nearestPlayer.position.z - e.position.z + nearestPlayer.velocity.z * 0.15,
                );
                _tmp.normalize();
                spawnEnemyProjectile(
                  scene,
                  e.position.x,
                  e.position.z,
                  _tmp.x * RANGED_BOLT_SPEED,
                  _tmp.z * RANGED_BOLT_SPEED,
                  RANGED_BOLT_DAMAGE,
                  BULLET_COLOR,
                );
              }
              e.winding = false;
              e.telegraph = 0;
              if (e.enemyType !== 'spitter') {
                e.abilityTimer = RANGED_COOLDOWN + Math.random() * 0.8;
              }
            } else {
              e.winding = true;
              e.telegraph = RANGED_WINDUP;
              e.abilityTimer = RANGED_WINDUP;
            }
          }
        }

        if (e.enemyType === 'spitter' && nearestPlayer && !(e.lobbing && e.lobbing > 0)) {
          const dx = nearestPlayer.position.x - e.position.x;
          const dz = nearestPlayer.position.z - e.position.z;
          const dsq = dx * dx + dz * dz;
          const invDist = 1 / Math.sqrt(dsq + 0.001);
          const dirX = dx * invDist;
          const dirZ = dz * invDist;
          const speed = e.moveSpeed || 3;
          if (dsq > RANGED_RANGE_SQ) {
            e.velocity.x = dirX * speed;
            e.velocity.z = dirZ * speed;
          } else if (dsq < RANGED_MIN_SQ) {
            e.velocity.x = -dirX * speed * 0.9;
            e.velocity.z = -dirZ * speed * 0.9;
          } else {
            e.velocity.x = -dirZ * speed * 0.5;
            e.velocity.z = dirX * speed * 0.5;
          }
        }
        break;
      }

      case 'dash': {
        if (!e.dashState) e.dashState = 'idle';

        switch (e.dashState) {
          case 'idle': {
            e.abilityTimer -= dt;
            if (e.abilityTimer <= 0) {
              e.dashState = 'windup';
              e.telegraph = DASH_WINDUP;
              e.abilityTimer = DASH_WINDUP;
            }
            break;
          }
          case 'windup': {
            e.abilityTimer -= dt;
            if (e.abilityTimer <= 0) {
              let nearest: any = null;
              let minDsq = Infinity;
              for (let p = 0; p < _players.length; p++) {
                const pl = _players[p];
                const dx = pl.position.x - e.position.x;
                const dz = pl.position.z - e.position.z;
                const dsq = dx * dx + dz * dz;
                if (dsq < minDsq) {
                  minDsq = dsq;
                  nearest = pl;
                }
              }
              let dashDirX = 0;
              let dashDirZ = 1;
              if (nearest) {
                const dx = nearest.position.x - e.position.x;
                const dz = nearest.position.z - e.position.z;
                const inv = 1 / Math.sqrt(dx * dx + dz * dz + 0.001);
                dashDirX = dx * inv;
                dashDirZ = dz * inv;
              }
              e.velocity.x = dashDirX * DASH_SPEED;
              e.velocity.z = dashDirZ * DASH_SPEED;
              e.dashState = 'dash';
              e.abilityTimer = DASH_DURATION;
              e.telegraph = 0;
            }
            break;
          }
          case 'dash': {
            e.abilityTimer -= dt;
            if (e.abilityTimer <= 0) {
              e.velocity.x *= 0.1;
              e.velocity.z *= 0.1;
              e.dashState = 'recover';
              e.abilityTimer = DASH_RECOVER;
            }
            break;
          }
          case 'recover': {
            e.abilityTimer -= dt;
            if (e.abilityTimer <= 0) {
              e.dashState = 'idle';
              e.abilityTimer =
                DASH_COOLDOWN_MIN + Math.random() * (DASH_COOLDOWN_MAX - DASH_COOLDOWN_MIN);
            }
            break;
          }
        }
        break;
      }

      case 'phase': {
        e.abilityTimer -= dt;
        if (e.abilityTimer <= 0) {
          e.phased = !e.phased;
          if (e.phased) {
            e.abilityTimer = PHASE_DURATION;
            e.telegraph = PHASE_DURATION;
          } else {
            e.abilityTimer =
              PHASE_COOLDOWN_MIN + Math.random() * (PHASE_COOLDOWN_MAX - PHASE_COOLDOWN_MIN);
            e.telegraph = 0;
          }
        }
        break;
      }

      case 'trash': {
        e.abilityTimer -= dt;
        if (e.abilityTimer <= 0) {
          if (e.winding) {
            for (let i = 0; i < TRASH_BURST; i++) {
              if (world.count('isEnemy') >= ABILITY_ENEMY_CAP) break;
              const angle = (i / TRASH_BURST) * Math.PI * 2;
              spawnEnemy(
                scene,
                e.position.x + Math.cos(angle) * 1.2,
                e.position.z + Math.sin(angle) * 1.2,
                EnemyType.VIRUS,
              );
            }
            e.winding = false;
            e.telegraph = 0;
            e.abilityTimer = TRASH_INTERVAL + Math.random() * 1.5;
          } else if (world.count('isEnemy') < ABILITY_ENEMY_CAP) {
            e.winding = true;
            e.telegraph = 0.5;
            e.abilityTimer = 0.5;
          } else {
            e.abilityTimer = 1.0;
          }
        }
        break;
      }

      case 'shield': {
        if (e.enemyType === 'weaver') {
          e.shieldHp = Math.min(AURA_SHIELD_MAX, (e.shieldHp ?? 0) + AURA_REGEN * dt);
        }
        break;
      }
    }
  }

  void _tmp;
  void AURA_GRANT;
}
