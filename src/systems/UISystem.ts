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
  // Mobile HUD - New elements
  mobileHealthFill: document.getElementById('mobile-health-fill'),
  mobileHpText: document.getElementById('mobile-hp-text'),
  mobileTimerDisplay: document.getElementById('mobile-timer-display'),
  mobileScoreDisplay: document.getElementById('mobile-score-display'),
  mobileXpFill: document.getElementById('mobile-xp-fill'),
  mobileLevelNum: document.getElementById('mobile-level-num'),
  // Inventory (Desktop)
  weaponSlots: document.getElementById('weapon-slots'),
  passiveSlots: document.getElementById('passive-slots'),
  // Inventory (Mobile - Combined)
  mobileAllSlots: document.getElementById('mobile-all-slots'),
};

// --- WEAPON ICONS (image paths for generated icons, emojis for pending) ---
const WEAPON_ICONS: Record<string, string> = {
  // Base weapons
  pulse_repeater: '/textures/ui/weapons/pulse_repeater.png',
  monowire_lash: '/textures/ui/weapons/monowire_lash.png',
  smart_rail_needles: '/textures/ui/weapons/smart_rail_needles.png',
  emp_pulse_node: '/textures/ui/weapons/emp_pulse_node.png',
  cryo_foam_disperser: '/textures/ui/weapons/cryo_foam_disperser.png',
  drone_halo: '/textures/ui/weapons/drone_halo.png',
  photon_blades: '/textures/ui/weapons/photon_blades.png',
  signal_hijacker: '/textures/ui/weapons/signal_hijacker.png',
  orbital_kill_ping: '🎯', // pending generation
  overclock_engine: '🔥', // pending generation
  memory_leak: '💾', // pending generation
  // Evolved weapons
  omega_pulse: '/textures/ui/weapons/omega_pulse.png',
  nanofiber_guillotine: '/textures/ui/weapons/nanofiber_guillotine.png',
  magnetic_railstorm: '/textures/ui/weapons/magnetic_railstorm.png',
  blackout_field: '/textures/ui/weapons/blackout_field.png',
  thermal_collapse: '/textures/ui/weapons/thermal_collapse.png',
  swarm_intelligence: '/textures/ui/weapons/swarm_intelligence.png',
  photon_curtain: '/textures/ui/weapons/photon_curtain.png',
  neural_cascade: '/textures/ui/weapons/neural_cascade.png',
  saturation_strike: '☄️', // pending generation
  runaway_singularity: '💥', // pending generation
  heap_overflow: '🔮', // pending generation
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
  // Mobile Level
  if (ui.mobileLevelNum && player.level) {
    ui.mobileLevelNum.innerText = player.level.toString();
  }

  if (ui.scoreText && player.score !== undefined) {
    ui.scoreText.innerText = player.score.toString();
  }
  // Mobile Score
  if (ui.mobileScoreDisplay && player.score !== undefined) {
    ui.mobileScoreDisplay.innerText = `SCORE: ${player.score}`;
  }

  // Mobile Health Bar & Text
  if (ui.mobileHealthFill && player.health) {
    ui.mobileHealthFill.style.width = `${Math.max(0, hpPercent)}%`;
  }
  if (ui.mobileHpText && player.health) {
    ui.mobileHpText.innerText = `${Math.ceil(Math.max(0, player.health.current))}/${player.health.max}`;
  }

  // 4. Update XP Bar (Desktop & Mobile)
  if (player.xp !== undefined && player.xpMax) {
    const xpPercent = (player.xp / player.xpMax) * 100;
    if (ui.xpBar) ui.xpBar.style.width = `${Math.min(100, xpPercent)}%`;
    if (ui.mobileXpFill) ui.mobileXpFill.style.width = `${Math.min(100, xpPercent)}%`;
  }

  // 5. Update Game Timer (throttled - only update when seconds change)
  const gameTime = getGameTime();
  const currentSecond = Math.floor(gameTime);

  // Show timer when game starts (not visible in menu)
  if (ui.gameTimer && gameTime > 0) {
    ui.gameTimer.classList.add('visible');
  }

  if (currentSecond !== lastTimerSecond) {
    lastTimerSecond = currentSecond;
    const minutes = Math.floor(gameTime / 60);
    const seconds = Math.floor(gameTime % 60);
    const timerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    if (ui.gameTimer) {
      ui.gameTimer.innerText = timerText;
      // Warning pulse when boss is near (after 7:00)
      if (gameTime >= BOSS_SPAWN_TIME - 60) {
        ui.gameTimer.classList.add('warning');
      }
    }
    // Mobile Timer
    if (ui.mobileTimerDisplay) {
      ui.mobileTimerDisplay.innerText = timerText;
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

  // Only update if changed
  if (weaponHash !== lastWeaponHash || passiveHash !== lastPassiveHash) {
    // Update desktop
    if (weaponHash !== lastWeaponHash) {
      lastWeaponHash = weaponHash;
      renderDesktopWeapons(weapons);
    }
    if (passiveHash !== lastPassiveHash) {
      lastPassiveHash = passiveHash;
      renderDesktopPassives(passives);
    }
    // Update mobile (combined)
    renderMobileInventory(weapons, passives);
  }
}

function renderDesktopWeapons(weapons: WeaponSlot[]) {
  if (!ui.weaponSlots) return;
  ui.weaponSlots.innerHTML = weapons.map(w => {
    const def = WEAPONS[w.weaponId];
    const iconPath = WEAPON_ICONS[w.weaponId] || '';
    const name = def?.name || w.weaponId;
    const isImage = iconPath.endsWith('.png');
    const iconHtml = isImage
      ? `<img class="slot-icon-img" src="${iconPath}" alt="${name}"/>`
      : `<span class="slot-icon">${iconPath || '🔹'}</span>`;
    return `
      <div class="inv-slot weapon" title="${name}">
        ${iconHtml}
        <span class="level-badge">${w.level}</span>
      </div>
    `;
  }).join('');
}

function renderDesktopPassives(passives: PassiveSlot[]) {
  if (!ui.passiveSlots) return;
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

function renderMobileInventory(weapons: WeaponSlot[], passives: PassiveSlot[]) {
  if (!ui.mobileAllSlots) return;

  // Render weapons as hexagonal slots
  const weaponHtml = weapons.map(w => {
    const iconPath = WEAPON_ICONS[w.weaponId] || '';
    const name = WEAPONS[w.weaponId]?.name || w.weaponId;
    const isImage = iconPath.endsWith('.png');
    const iconHtml = isImage
      ? `<img class="slot-icon-img" src="${iconPath}" alt="${name}"/>`
      : `<span class="slot-icon">${iconPath || '🔹'}</span>`;
    return `
      <div class="mobile-hex-slot weapon" title="${name}">
        ${iconHtml}
        <span class="level-badge">LV${w.level}</span>
      </div>
    `;
  }).join('');

  // Render passives as hexagonal slots
  const passiveHtml = passives.map(p => {
    const icon = PASSIVE_ICONS[p.passiveId] || '🔸';
    const name = PASSIVES[p.passiveId]?.name || p.passiveId;
    return `
      <div class="mobile-hex-slot passive" title="${name}">
        <span class="slot-icon">${icon}</span>
        <span class="level-badge">LV${p.level}</span>
      </div>
    `;
  }).join('');

  ui.mobileAllSlots.innerHTML = weaponHtml + passiveHtml;
}
