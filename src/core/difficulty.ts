/**
 * Co-op difficulty scaling.
 *
 * A solo run is tuned for one player. With 2-4 fighters the arena was trivial:
 * the same spawn budget and enemy HP split across more guns. These helpers ramp
 * total spawn pressure and enemy toughness with the number of LIVING players so
 * each fighter feels about as busy as they would solo, while the horde as a
 * whole scales up. Solo (or a wiped party) returns a neutral 1.0 multiplier.
 */

import { world } from './world';

export function livingPlayerCount(): number {
  let n = 0;
  for (const p of world.with('isPlayer', 'health')) {
    if (p.health && p.health.current > 0) n++;
  }
  return Math.max(1, n);
}

/** More enemies per wave: +65% spawn budget per extra living player. */
export function partySpawnMultiplier(): number {
  return 1 + (livingPlayerCount() - 1) * 0.65;
}

/** Tankier enemies: +35% HP per extra living player. */
export function partyHpMultiplier(): number {
  return 1 + (livingPlayerCount() - 1) * 0.35;
}
