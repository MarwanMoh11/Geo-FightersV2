import { world } from '../core/world';

// 1. Define Upgrade Types
type Upgrade = {
  id: string;
  name: string;
  desc: string;
  apply: (player: any) => void;
};

// 2. The Upgrade Pool
const UPGRADE_POOL: Upgrade[] = [
  {
    id: 'fire_rate',
    name: 'OVERCLOCK',
    desc: 'Fire Rate +20%',
    // Lower cooldown = faster shooting
    apply: (p) => {
      if (p.weapon) p.weapon.fireRate *= 0.8;
    },
  },
  {
    id: 'damage',
    name: 'HIGH VOLTAGE',
    desc: 'Damage +1',
    apply: (p) => {
      if (p.weapon) p.weapon.damage += 1;
    },
  },
  {
    id: 'bullet_speed',
    name: 'ACCELERATOR',
    desc: 'Bullet Speed +20%',
    apply: (p) => {
      if (p.weapon) p.weapon.bulletSpeed *= 1.2;
    },
  },
  {
    id: 'multishot',
    name: 'SPLIT STREAM',
    desc: 'Range +50%',
    apply: (p) => {
      if (p.weapon) p.weapon.bulletLifetime *= 1.5;
    },
  },
];

// DOM Cache
const modal = document.getElementById('upgrade-modal');
const container = document.getElementById('cards-container');

// Pause State
export let isGamePaused = false;

// 3. Trigger Function (Called by LootSystem)
export function triggerLevelUp() {
  isGamePaused = true;
  if (modal) modal.classList.remove('hidden');
  renderCards();
}

// 4. Render UI
function renderCards() {
  if (!container) return;
  container.innerHTML = '';

  // Shuffle and pick 3
  const shuffled = [...UPGRADE_POOL].sort(() => 0.5 - Math.random());
  const choices = shuffled.slice(0, 3);

  choices.forEach((upgrade) => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `
            <div class="card-title">${upgrade.name}</div>
            <div class="card-desc">${upgrade.desc}</div>
            <div class="card-rarity">COMMON</div>
        `;

    // Touch Handler
    card.onclick = () => selectUpgrade(upgrade);

    container.appendChild(card);
  });
}

// 5. Select & Resume
function selectUpgrade(upgrade: Upgrade) {
  const player = world.with('isPlayer', 'weapon').first;
  if (player) {
    upgrade.apply(player);
    console.log(`Applied Upgrade: ${upgrade.name}`);
  }

  // Hide Modal & Resume
  if (modal) modal.classList.add('hidden');
  isGamePaused = false;
}
