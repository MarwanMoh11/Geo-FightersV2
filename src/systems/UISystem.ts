import { world } from '../core/world';

const ui = {
  healthBar: document.getElementById('health-bar-fill'),
  healthText: document.getElementById('health-text'),
  levelText: document.getElementById('level-text'),
  scoreText: document.getElementById('score-text'),
  xpBar: document.getElementById('xp-bar-fill'),
};

// --- DEBUG STATE ---
let debugDiv: HTMLElement | null = null;
let lastWarning = '';
let fps = 0;
let lastTime = 0;
let frameCount = 0;

// Hook console.warn to capture lag logs
const originalWarn = console.warn;
console.warn = (...args) => {
  lastWarning = args.map((a) => String(a)).join(' ');
  originalWarn(...args);
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
  if (ui.scoreText && player.score !== undefined) {
    ui.scoreText.innerText = player.score.toString();
  }

  // 4. Update XP Bar
  if (ui.xpBar && player.xp !== undefined && player.xpMax) {
    const xpPercent = (player.xp / player.xpMax) * 100;
    ui.xpBar.style.width = `${Math.min(100, xpPercent)}%`;
  }

  // 5. DEBUG OVERLAY
  if (!debugDiv) {
    debugDiv = document.createElement('div');
    debugDiv.style.position = 'absolute';
    debugDiv.style.top = '100px';
    debugDiv.style.left = '10px';
    debugDiv.style.color = '#00ff00';
    debugDiv.style.fontFamily = 'monospace';
    debugDiv.style.fontWeight = 'bold';
    debugDiv.style.pointerEvents = 'none';
    debugDiv.style.zIndex = '9999';
    debugDiv.style.fontSize = '12px';
    debugDiv.style.backgroundColor = 'rgba(0,0,0,0.6)';
    debugDiv.style.padding = '8px';
    debugDiv.style.whiteSpace = 'pre-wrap';
    debugDiv.style.maxWidth = '300px';
    document.body.appendChild(debugDiv);
  }

  // CalcFPS
  const now = performance.now();
  frameCount++;
  if (now - lastTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastTime = now;
  }

  if (debugDiv) {
    debugDiv.innerHTML = `FPS: ${fps}\nLAST LOG: ${lastWarning}`;
  }
}
