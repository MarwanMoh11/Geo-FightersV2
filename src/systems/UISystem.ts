import { world } from '../core/world';

const ui = {
  healthBar: document.getElementById('health-bar-fill'),
  healthText: document.getElementById('health-text'),
  levelText: document.getElementById('level-text'),
  scoreText: document.getElementById('score-text'),
  xpBar: document.getElementById('xp-bar-fill'),
  // Mobile HUD
  mobileHealth: document.getElementById('mobile-health'),
  mobileLevel: document.getElementById('mobile-level'),
  mobileScore: document.getElementById('mobile-score'),
};

export function UISystem() {
  // 1. Find Player Data
  const player = world.with('isPlayer', 'health', 'xp', 'xpMax', 'level', 'score').first;

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
}
