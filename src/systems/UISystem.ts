import { world } from '../core/world';
import type { WeaponSlot, PassiveSlot } from '../core/world';
import { WEAPONS } from '../core/WeaponRegistry';
import { PASSIVES } from '../core/PassiveRegistry';
import { getGameTime, BOSS_SPAWN_TIME } from './ChestSystem';

// --- DOM ELEMENTS ---
const ui = {
  healthBar: document.getElementById('health-bar-fill'),
  healthText: document.getElementById('health-text'),
  levelText: document.getElementById('level-text'),
  scoreText: document.getElementById('score-text'),
  xpBar: document.getElementById('xp-bar-fill'),
  xpLevelText: document.getElementById('xp-level-text'),
  // Timer & Boss
  gameTimer: document.getElementById('game-timer'),
  bossHealthContainer: document.getElementById('boss-health-container'),
  bossHealthFill: document.getElementById('boss-health-fill'),
  bossName: document.querySelector('.boss-name') as HTMLElement | null,
  // Mobile HUD
  mobileHealth: document.getElementById('mobile-health'),
  mobileLevel: document.getElementById('mobile-level'),
  mobileScore: document.getElementById('mobile-score'),
  // Inventory (Desktop)
  weaponSlots: document.getElementById('weapon-slots'),
  passiveSlots: document.getElementById('passive-slots'),
  // Inventory (Mobile)
  mobileWeaponSlots: document.getElementById('mobile-weapon-slots'),
  mobilePassiveSlots: document.getElementById('mobile-passive-slots'),
};

// --- WEAPON ICONS (emoji shortcuts based on weapon type) ---
const WEAPON_ICONS: Record<string, string> = {
  // Base weapons
  pulse_repeater: '🔫',
  monowire_lash: '⚔️',
  smart_rail_needles: '📍',
  emp_pulse_node: '⚡',
  cryo_foam_disperser: '❄️',
  drone_halo: '🛸',
  photon_blades: '💫',
  signal_hijacker: '📡',
  orbital_kill_ping: '🎯',
  overclock_engine: '🔥',
  memory_leak: '💾',
  // Evolved weapons
  omega_pulse: '🌟',
  nanofiber_guillotine: '⚔️',
  magnetic_railstorm: '🌀',
  blackout_field: '⚫',
  thermal_collapse: '💠',
  swarm_intelligence: '🐝',
  photon_curtain: '✨',
  neural_cascade: '🧠',
  saturation_strike: '☄️',
  runaway_singularity: '💥',
  heap_overflow: '🔮',
};

const PASSIVE_ICONS: Record<string, string> = {
  power_cell: '⚡',
  accelerator_chip: '🚀',
  capacitor: '🔋',
  cooling_system: '❄️',
  clock_skipper: '⏱️',
  magnet_loader: '🧲',
  shield_matrix: '🛡️',
  regen_module: '💚',
  speed_boosters: '👟',
  ai_core: '🤖',
  optics_suite: '👁️',
  signal_booster: '📶',
  targeting_os: '🎯',
  quantum_regulator: '⚛️',
  debug_suite: '🐛',
};

// --- CACHE for preventing unnecessary DOM updates ---
let lastWeaponHash = '';
let lastPassiveHash = '';
let lastTimerSecond = -1;
let lastBossVisible = false;
let lastBossPercent = -1;

export function UISystem() {
  // 1. Find Player Data
  const player = world.with('isPlayer', 'health', 'xp', 'xpMax', 'level', 'score', 'weaponSlots', 'passiveSlots').first;

  // Safety Check
  if (!player || !player.health) return;

  // 2. Update Health UI
  const hpPercent = (player.health.current / player.health.max) * 100;

  if (ui.healthBar) ui.healthBar.style.width = `${Math.max(0, hpPercent)}%`;
  if (ui.healthText)
    ui.healthText.innerText = `${Math.ceil(Math.max(0, player.health.current))} / ${player.health.max}`;

  // 3. Update Text Stats
  if (ui.levelText && player.level) {
    ui.levelText.innerText = player.level.toString().padStart(2, '0');
  }
  if (ui.xpLevelText && player.level) {
    ui.xpLevelText.innerText = player.level.toString().padStart(2, '0');
  }
  if (ui.mobileLevel && player.level) {
    ui.mobileLevel.innerText = `LV ${player.level}`;
  }

  if (ui.scoreText && player.score !== undefined) {
    ui.scoreText.innerText = player.score.toString();
  }
  if (ui.mobileScore && player.score !== undefined) {
    ui.mobileScore.innerText = `⚡ ${player.score}`;
  }

  // Mobile Health
  if (ui.mobileHealth && player.health) {
    ui.mobileHealth.innerText = `❤️ ${Math.ceil(Math.max(0, player.health.current))}`;
  }

  // 4. Update XP Bar
  if (ui.xpBar && player.xp !== undefined && player.xpMax) {
    const xpPercent = (player.xp / player.xpMax) * 100;
    ui.xpBar.style.width = `${Math.min(100, xpPercent)}%`;
  }

  // 5. Update Game Timer (throttled - only update when seconds change)
  const gameTime = getGameTime();
  const currentSecond = Math.floor(gameTime);

  // Show timer when game starts (not visible in menu)
  if (ui.gameTimer && gameTime > 0) {
    ui.gameTimer.classList.add('visible');
  }

  if (currentSecond !== lastTimerSecond && ui.gameTimer) {
    lastTimerSecond = currentSecond;
    const minutes = Math.floor(gameTime / 60);
    const seconds = Math.floor(gameTime % 60);
    ui.gameTimer.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Warning pulse when boss is near (after 7:00)
    if (gameTime >= BOSS_SPAWN_TIME - 60) {
      ui.gameTimer.classList.add('warning');
    }
  }

  // 6. Update Boss Health Bar (throttled - only query after near spawn time)
  if (gameTime >= BOSS_SPAWN_TIME - 10) {
    const boss = world.with('isBoss', 'health').first;
    const hasBoss = !!(boss && boss.health);

    if (hasBoss !== lastBossVisible) {
      lastBossVisible = hasBoss;
      if (ui.bossHealthContainer) {
        if (hasBoss) {
          ui.bossHealthContainer.classList.remove('hidden');
          if (ui.bossName) ui.bossName.innerText = 'SYSTEM CORRUPTION';
        } else {
          ui.bossHealthContainer.classList.add('hidden');
        }
      }
    }

    if (hasBoss && boss && boss.health && ui.bossHealthFill) {
      const bossPercent = Math.floor((boss.health.current / boss.health.max) * 100);
      if (bossPercent !== lastBossPercent) {
        lastBossPercent = bossPercent;
        ui.bossHealthFill.style.width = `${Math.max(0, bossPercent)}%`;
      }
    }
  }

  // 7. Update Inventory Display (only when changed)
  updateInventoryDisplay(player.weaponSlots || [], player.passiveSlots || []);
}

function updateInventoryDisplay(weapons: WeaponSlot[], passives: PassiveSlot[]) {
  // Create hash to check if update needed
  const weaponHash = weapons.map(w => `${w.weaponId}:${w.level}`).join(',');
  const passiveHash = passives.map(p => `${p.passiveId}:${p.level}`).join(',');

  // Update weapons if changed
  if (weaponHash !== lastWeaponHash) {
    lastWeaponHash = weaponHash;
    renderWeaponSlots(weapons);
  }

  // Update passives if changed
  if (passiveHash !== lastPassiveHash) {
    lastPassiveHash = passiveHash;
    renderPassiveSlots(passives);
  }
}

function renderWeaponSlots(weapons: WeaponSlot[]) {
  // Desktop
  if (ui.weaponSlots) {
    ui.weaponSlots.innerHTML = weapons.map(w => {
      const def = WEAPONS[w.weaponId];
      const icon = WEAPON_ICONS[w.weaponId] || '🔹';
      const name = def?.name || w.weaponId;
      return `
        <div class="inv-slot weapon" title="${name}">
          <span class="slot-icon">${icon}</span>
          <span class="level-badge">${w.level}</span>
        </div>
      `;
    }).join('');
  }

  // Mobile
  if (ui.mobileWeaponSlots) {
    ui.mobileWeaponSlots.innerHTML = weapons.map(w => {
      const icon = WEAPON_ICONS[w.weaponId] || '🔹';
      return `
        <div class="mobile-inv-slot weapon">
          ${icon}
          <span class="level-badge">${w.level}</span>
        </div>
      `;
    }).join('');
  }
}

function renderPassiveSlots(passives: PassiveSlot[]) {
  // Desktop
  if (ui.passiveSlots) {
    ui.passiveSlots.innerHTML = passives.map(p => {
      const def = PASSIVES[p.passiveId];
      const icon = PASSIVE_ICONS[p.passiveId] || '🔸';
      const name = def?.name || p.passiveId;
      return `
        <div class="inv-slot passive" title="${name}">
          <span class="slot-icon">${icon}</span>
          <span class="level-badge">${p.level}</span>
        </div>
      `;
    }).join('');
  }

  // Mobile
  if (ui.mobilePassiveSlots) {
    ui.mobilePassiveSlots.innerHTML = passives.map(p => {
      const icon = PASSIVE_ICONS[p.passiveId] || '🔸';
      return `
        <div class="mobile-inv-slot passive">
          ${icon}
          <span class="level-badge">${p.level}</span>
        </div>
      `;
    }).join('');
  }
}
