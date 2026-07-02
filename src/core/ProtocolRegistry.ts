/**
 * ProtocolRegistry — Arcana-style run modifiers ("Data Protocols").
 *
 * One protocol is picked from three offers at the start of every solo run.
 * Protocols are build-warping trades, not stat bumps: each one changes what a
 * good build looks like, which multiplies run variety across the arsenal.
 */

import type { PlayerStats } from './PlayerStats';
import { uiState } from './UIState.svelte.ts';
import { world } from './world';

export interface ProtocolDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  apply: (s: PlayerStats) => void;
}

export const PROTOCOLS: ProtocolDef[] = [
  {
    id: 'glass_kernel',
    name: 'GLASS KERNEL',
    icon: '💎',
    description: '+80% damage. Max HP halved.',
    apply: (s) => {
      s.might *= 1.8;
      // The HP halving needs the live entity — handled in selectProtocol.
    },
  },
  {
    id: 'mirror_process',
    name: 'MIRROR PROCESS',
    icon: '🪞',
    description: '+1 projectile on everything. -25% damage.',
    apply: (s) => {
      s.amount += 1;
      s.might *= 0.75;
    },
  },
  {
    id: 'overclock_loop',
    name: 'OVERCLOCK LOOP',
    icon: '⚡',
    description: 'Weapons fire 30% faster. -15% damage.',
    apply: (s) => {
      s.cooldown += 0.3;
      s.might *= 0.85;
    },
  },
  {
    id: 'scavenger_daemon',
    name: 'SCAVENGER DAEMON',
    icon: '🪙',
    description: 'Triple credit drops. Pickup radius -40%.',
    apply: (s) => {
      s.magnet *= 0.6;
    },
  },
  {
    id: 'vampiric_cache',
    name: 'VAMPIRIC CACHE',
    icon: '🩸',
    description: 'Regenerate 2 HP/s. -20% max HP.',
    apply: (s) => {
      s.recovery += 2;
    },
  },
  {
    id: 'bulwark_protocol',
    name: 'BULWARK PROTOCOL',
    icon: '🛡️',
    description: '+3 armor. -15% move speed.',
    apply: (s) => {
      s.armor += 3;
      s.moveSpeed *= 0.85;
    },
  },
  {
    id: 'momentum_engine',
    name: 'MOMENTUM ENGINE',
    icon: '🚀',
    description: '+25% speed, +15% damage. -1 armor.',
    apply: (s) => {
      s.moveSpeed *= 1.25;
      s.might *= 1.15;
      s.armor -= 1;
    },
  },
  {
    id: 'loot_surge',
    name: 'LOOT SURGE',
    icon: '🎰',
    description: '+50% luck. Enemies swarm 20% harder.',
    apply: (s) => {
      s.luck *= 1.5;
      s.curse += 0.2;
    },
  },
];

export function getProtocol(id: string): ProtocolDef | null {
  return PROTOCOLS.find((p) => p.id === id) ?? null;
}

/** Roll three distinct protocols and open the pick modal. */
export function offerProtocolChoice(): void {
  const pool = [...PROTOCOLS];
  const picks: string[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0].id);
  }
  uiState.protocolChoices = picks;
  uiState.showProtocolChoice = true;
}

/** Apply the chosen protocol to the local player and close the modal. */
export function selectProtocol(id: string): void {
  const proto = getProtocol(id);
  uiState.showProtocolChoice = false;
  uiState.protocolChoices = [];
  if (!proto) return;

  const player = world.with('isLocalPlayer', 'health').first as
    | { stats?: PlayerStats; health?: { current: number; max: number } }
    | undefined;
  if (!player?.stats) return;

  proto.apply(player.stats);
  uiState.activeProtocolId = id;

  // HP-altering protocols need the live health block.
  if (player.health) {
    if (id === 'glass_kernel') {
      player.health.max = Math.max(30, Math.round(player.health.max * 0.5));
      player.health.current = Math.min(player.health.current, player.health.max);
    } else if (id === 'vampiric_cache') {
      player.health.max = Math.max(30, Math.round(player.health.max * 0.8));
      player.health.current = Math.min(player.health.current, player.health.max);
    }
    uiState.health.current = player.health.current;
    uiState.health.max = player.health.max;
  }
}
