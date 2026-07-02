/**
 * CharacterRegistry — playable avatars with distinct starts and quirks.
 *
 * Each character = starting weapon + stat identity + one memorable quirk.
 * Most are locked behind achievements (see ProgressManager) — the roster page
 * is the game's primary unlock carrot.
 */

import type { PlayerStats } from './PlayerStats';

export interface CharacterDef {
  id: string;
  name: string;
  icon: string; // emoji used on cards + HUD
  color: number; // core tint
  weaponName: string;
  description: string;
  starterWeaponId: string;
  baseHp: number;
  /** Multiplies/adjusts the default stat block at run start. */
  applyStats: (s: PlayerStats) => void;
  /** One-line quirk shown on the card. */
  quirk?: string;
  statPreview: string[]; // short chips like "HP: 100"
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'cypher',
    name: 'CYPHER',
    icon: '💠',
    color: 0x00d5ff,
    weaponName: 'MK-1 Pulse Repeater',
    description: 'Balanced and reliable for long deployments.',
    starterWeaponId: 'pulse_repeater',
    baseHp: 100,
    applyStats: () => {},
    statPreview: ['HP: 100', 'SPD: 100%', 'Might: 100%'],
  },
  {
    id: 'lash',
    name: 'LASH',
    icon: '🧬',
    color: 0xff00ff,
    weaponName: 'Monowire Lash',
    description: 'Swift duelist. High speed and luck, low protection.',
    starterWeaponId: 'monowire_lash',
    baseHp: 90,
    applyStats: (s) => {
      s.moveSpeed *= 1.15;
      s.luck *= 1.1;
    },
    statPreview: ['HP: 90', 'SPD: 115%', 'Luck: 110%'],
  },
  {
    id: 'rail',
    name: 'RAIL',
    icon: '⚙️',
    color: 0x00ff88,
    weaponName: 'Smart Rail Needles',
    description: 'Armored platform. Slow but devastating.',
    starterWeaponId: 'smart_rail_needles',
    baseHp: 120,
    applyStats: (s) => {
      s.might *= 1.15;
      s.moveSpeed *= 0.9;
      s.armor += 1;
    },
    statPreview: ['HP: 120', 'SPD: 90%', 'Might: 115%', 'Armor: +1'],
  },
  {
    id: 'nova',
    name: 'NOVA',
    icon: '🌀',
    color: 0xaa66ff,
    weaponName: 'EMP Pulse Node',
    description: 'Field controller. Everything hits a wider area.',
    starterWeaponId: 'emp_pulse_node',
    baseHp: 95,
    applyStats: (s) => {
      s.area *= 1.25;
      s.might *= 0.9;
    },
    quirk: 'All attack areas +25%',
    statPreview: ['HP: 95', 'Area: 125%', 'Might: 90%'],
  },
  {
    id: 'byte',
    name: 'BYTE',
    icon: '🛰️',
    color: 0xffcc00,
    weaponName: 'Drone Halo',
    description: 'Scavenger unit. Hoovers the battlefield clean.',
    starterWeaponId: 'drone_halo',
    baseHp: 100,
    applyStats: (s) => {
      s.magnet *= 1.5;
      s.luck *= 1.15;
      s.might *= 0.95;
    },
    quirk: 'Pickup radius +50%',
    statPreview: ['HP: 100', 'Magnet: 150%', 'Luck: 115%'],
  },
  {
    id: 'ghost',
    name: 'GHOST',
    icon: '👁️',
    color: 0xccccff,
    weaponName: 'Memory Leak',
    description: 'Fragile phantom that attacks relentlessly.',
    starterWeaponId: 'memory_leak',
    baseHp: 70,
    applyStats: (s) => {
      s.cooldown += 0.15;
      s.moveSpeed *= 1.1;
    },
    quirk: 'Weapons fire 15% faster',
    statPreview: ['HP: 70', 'CDR: +15%', 'SPD: 110%'],
  },
  {
    id: 'titan',
    name: 'TITAN',
    icon: '🗿',
    color: 0xff8844,
    weaponName: 'Orbital Kill Ping',
    description: 'Walking fortress. Cannot be rushed down.',
    starterWeaponId: 'orbital_kill_ping',
    baseHp: 150,
    applyStats: (s) => {
      s.armor += 2;
      s.moveSpeed *= 0.8;
      s.might *= 1.1;
    },
    quirk: '+2 Armor, immovable',
    statPreview: ['HP: 150', 'Armor: +2', 'SPD: 80%'],
  },
  {
    id: 'flux',
    name: 'FLUX',
    icon: '🎲',
    color: 0xff3377,
    weaponName: 'Overclock Engine',
    description: 'Chaos gambler. Runs hot, wins big.',
    starterWeaponId: 'overclock_engine',
    baseHp: 85,
    applyStats: (s) => {
      s.luck *= 1.25;
      s.curse += 0.25;
      s.might *= 1.05;
    },
    quirk: 'Luck +25%, but enemies swarm harder',
    statPreview: ['HP: 85', 'Luck: 125%', 'Curse: +25%'],
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
