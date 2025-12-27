import * as THREE from 'three';
import { world } from '../core/world';
import { SHOTGUN_WEAPON, LAUNCHER_WEAPON, RAILGUN_WEAPON } from '../core/definitions';

type Upgrade = { id: string; name: string; desc: string; apply: (player: any) => void };

function spawnWeapon(player: any, stats: any) {
  world.add({
    isWeapon: true,
    ownerId: player.id,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    weapon: {
      cooldownTimer: 0.5,
      fireRate: stats.fireRate,
      damage: stats.damage,
      bulletSpeed: stats.speed,
      bulletColor: stats.color,
      bulletLifetime: stats.range,

      bulletWidth: stats.width,
      bulletLength: stats.length,
      visualStyle: stats.visualStyle, // <--- MAP THIS

      bulletCount: stats.count,
      bulletSpread: stats.spread,
      knockback: stats.knockback,
      bulletPierce: stats.pierce,
      bulletExplodeRadius: stats.explodeRadius,
    },
  });
}

const UPGRADE_POOL: Upgrade[] = [
  {
    id: 'fire_rate',
    name: 'OVERCLOCK',
    desc: 'Global Fire Rate +20%',
    apply: (p) => {
      if (p.modifiers) p.modifiers.fireRateMult *= 0.8;
    },
  },
  {
    id: 'damage',
    name: 'HIGH VOLTAGE',
    desc: 'Global Damage +1',
    apply: (p) => {
      if (p.modifiers) p.modifiers.damageAdd += 1;
    },
  },
  {
    id: 'unlock_shotgun',
    name: 'V-8 SCATTERGUN',
    desc: 'ADD WEAPON: Short range, high spread.',
    apply: (p) => {
      spawnWeapon(p, SHOTGUN_WEAPON);
      console.log('ADDED SCATTERGUN');
    },
  },
  {
    id: 'unlock_launcher',
    name: 'HELIX-7 LAUNCHER',
    desc: 'ADD WEAPON: Explosive Area Damage.',
    apply: (p) => {
      spawnWeapon(p, LAUNCHER_WEAPON);
      console.log('ADDED LAUNCHER');
    },
  },
  {
    id: 'unlock_railgun',
    name: 'OMNI-RAIL CANNON',
    desc: 'ADD WEAPON: Infinite Pierce Beam.',
    apply: (p) => {
      spawnWeapon(p, RAILGUN_WEAPON);
      console.log('ADDED RAILGUN');
    },
  },
];

const modal = document.getElementById('upgrade-modal');
const container = document.getElementById('cards-container');
export let isGamePaused = false;

export function triggerLevelUp() {
  isGamePaused = true;
  if (modal) modal.classList.remove('hidden');
  renderCards();
}

function renderCards() {
  if (!container) return;
  container.innerHTML = '';
  const shuffled = [...UPGRADE_POOL].sort(() => 0.5 - Math.random());
  const choices = shuffled.slice(0, 3);

  choices.forEach((upgrade) => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    if (upgrade.id.includes('unlock')) {
      card.style.borderColor = '#ffaa00';
      card.style.boxShadow = '0 0 15px rgba(255, 170, 0, 0.4)';
    }
    card.innerHTML = `
            <div class="card-title" style="${upgrade.id.includes('unlock') ? 'color:#ffaa00' : ''}">${upgrade.name}</div>
            <div class="card-desc">${upgrade.desc}</div>
            <div class="card-rarity">${upgrade.id.includes('unlock') ? 'RARE' : 'COMMON'}</div>
        `;
    card.onclick = () => selectUpgrade(upgrade);
    container.appendChild(card);
  });
}

function selectUpgrade(upgrade: Upgrade) {
  const player = world.with('isPlayer', 'modifiers').first;
  if (player) upgrade.apply(player);
  if (modal) modal.classList.add('hidden');
  isGamePaused = false;
}
