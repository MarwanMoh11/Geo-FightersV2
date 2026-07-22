import * as THREE from 'three';
import { world } from './world';
import { WEAPONS, getWeaponStatsAtLevel } from './WeaponRegistry';

/**
 * Activate ?max stress-test mode. Called once when the run starts.
 * - Gives the player every weapon at maximum level.
 * - Makes the player invincible (damage immunity).
 * - Forces the horde spawner to saturate at MAX_ENEMIES.
 */
export function applyMaxMode(scene: THREE.Scene): void {
  const isMax = !!(window as any).__MAX_MODE;
  if (!isMax) return;

  const player = world.with('isLocalPlayer', 'health').first;
  if (!player) return;

  // Make the player functionally invincible (health never depletes).
  if (player.health) {
    player.health.max = 9999999;
    player.health.current = 9999999;
  }
  // Prevent contact damage from ever ticking the player down.
  player.invulnTimer = 9999;

  // Remove the starter weapon so we can add all weapons cleanly.
  const oldWeapons = Array.from(world.with('isWeapon', 'ownerId'));
  for (const w of oldWeapons) {
    if (w.ownerId === player.id) {
      world.remove(w);
    }
  }
  // Also clear orbitals.
  const oldOrbitals = Array.from(world.with('isOrbital', 'orbitalData'));
  for (const orb of oldOrbitals) {
    if (orb.orbitalData?.ownerId === player.id) {
      if (orb.transform) scene.remove(orb.transform);
      world.remove(orb);
    }
  }

  // Grant every weapon in the registry at its maximum level.
  const allWeaponIds = Object.keys(WEAPONS);
  const slots: { weaponId: string; level: number }[] = [];
  for (const weaponId of allWeaponIds) {
    const def = WEAPONS[weaponId];
    const maxLvl = def.maxLevel;
    const stats = getWeaponStatsAtLevel(weaponId, maxLvl);
    if (!stats) continue;

    slots.push({ weaponId, level: maxLvl });

    world.add({
      isWeapon: true,
      weaponId,
      ownerId: player.id,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      weapon: {
        cooldownTimer: 0,
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
  player.weaponSlots = slots;
}
