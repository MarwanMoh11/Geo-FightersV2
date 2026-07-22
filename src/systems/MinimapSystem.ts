// --- MINIMAP SYSTEM ---
// Player-centric tactical radar: the local player sits at the center and the
// world scrolls under them. Off-screen elites and the boss are pinned to the
// rim as direction arrows so threats read at a glance.

import { dlog, dwarn } from '../core/debug';
import { world } from '../core/world';
import { collectPois } from './WayfindingSystem';
import { getBlockingObstacles } from '../core/LevelData';
import { getQualityProfile } from '../core/quality';

// Canvas and context references
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

// The minimap doesn't need 60fps — redraw at the quality profile's interval
let lastDraw = 0;

// World units per pixel. Tighter than the old world-fixed map so the radar
// shows the immediate combat area (~±40 units) around the player.
const SCALE = 80 / 150;

// Elite / mini-boss enemy types worth an off-screen direction arrow
const ELITE_TYPES = new Set(['firewall', 'enforcer', 'warden', 'colossus', 'hydra', 'overseer']);

// Colors
const COLORS = {
  background: '#0a0a15',
  wall: '#3a3a4a',
  prop: '#4a4a5a',
  player: '#00ffff',
  teammate: '#ff00ff',
  enemy: '#ff0055',
  elite: '#ff9500',
  boss: '#ff2d55',
  xp: '#00ff88',
  chest: '#ffaa00',
  border: '#2de2e6',
};

/**
 * Initialize the minimap canvas
 */
export function initMinimap(): void {
  canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  if (canvas) {
    ctx = canvas.getContext('2d');
    dlog('[MINIMAP] Initialized');
  } else {
    dwarn('[MINIMAP] Canvas not found');
  }
}

/**
 * Update the minimap every frame (throttled by quality profile)
 */
export function MinimapSystem(): void {
  if (!ctx || !canvas) return;

  const now = performance.now();
  if (now - lastDraw < getQualityProfile().minimapInterval * 1000) return;
  lastDraw = now;

  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;

  // Radar is centered on the local player (fall back to any player)
  const local =
    world.with('isLocalPlayer', 'position').first ?? world.with('isPlayer', 'position').first;
  const ox = local ? local.position.x : 0;
  const oz = local ? local.position.z : 0;

  // World -> map, relative to the local player (who is fixed at the center)
  const mapX = (wx: number) => cx + (wx - ox) / SCALE;
  const mapZ = (wz: number) => cy + (wz - oz) / SCALE;
  const onMap = (x: number, y: number) => x >= 0 && x <= width && y >= 0 && y <= height;

  // Clear + border
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  // Obstacles (only nearby ones are on-screen now)
  for (const obs of getBlockingObstacles()) {
    if (obs.id.startsWith('wall_')) continue;
    const x = mapX(obs.x);
    const y = mapZ(obs.z);
    const w = Math.max(1, obs.width / SCALE);
    const h = Math.max(1, obs.depth / SCALE);
    if (!onMap(x, y)) continue;
    ctx.fillStyle = obs.type === 'wall' ? COLORS.wall : COLORS.prop;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  }

  // XP shards (small green)
  ctx.fillStyle = COLORS.xp;
  for (const xp of world.with('isXP', 'position')) {
    const x = mapX(xp.position.x);
    const y = mapZ(xp.position.z);
    if (!onMap(x, y)) continue;
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chests (orange diamonds)
  ctx.fillStyle = COLORS.chest;
  for (const chest of world.with('isChest', 'position')) {
    const x = mapX(chest.position.x);
    const y = mapZ(chest.position.z);
    if (!onMap(x, y)) continue;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x, y + 3);
    ctx.lineTo(x - 3, y);
    ctx.closePath();
    ctx.fill();
  }

  // Points of interest (shrines, stash, drops, pickups, event sites)
  for (const poi of collectPois()) {
    const x = mapX(poi.x);
    const y = mapZ(poi.z);
    if (!onMap(x, y)) continue;
    ctx.fillStyle = poi.color;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  // Enemies. Regular ones only when on-screen; elites/boss also get an
  // off-screen edge arrow so you can feel a threat closing in. At horde
  // counts, decimate fodder dots (elites always drawn) — 2500 canvas arcs
  // per redraw would stall the frame.
  const enemyTotal = world.count('isEnemy');
  const fodderStep = enemyTotal > 400 ? Math.ceil(enemyTotal / 300) : 1;
  let fodderIdx = 0;
  for (const enemy of world.with('isEnemy', 'position')) {
    const isBoss = !!enemy.isBoss;
    const isElite = isBoss || ELITE_TYPES.has(enemy.enemyType || '');
    if (!isElite && fodderStep > 1 && fodderIdx++ % fodderStep !== 0) continue;
    const x = mapX(enemy.position.x);
    const y = mapZ(enemy.position.z);

    if (onMap(x, y)) {
      ctx.fillStyle = isBoss ? COLORS.boss : isElite ? COLORS.elite : COLORS.enemy;
      ctx.beginPath();
      ctx.arc(x, y, isBoss ? 5 : isElite ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (isElite) {
      drawEdgeArrow(ctx, cx, cy, enemy.position.x - ox, enemy.position.z - oz, isBoss);
    }
  }

  // Players: teammates first, then the local player on top at the center
  for (const p of world.with('isPlayer', 'position')) {
    if (p.isLocalPlayer) continue;
    if (p.health && p.health.current <= 0) continue; // hide downed ghosts
    const x = mapX(p.position.x);
    const y = mapZ(p.position.z);
    if (!onMap(x, y)) {
      drawEdgeArrow(ctx, cx, cy, p.position.x - ox, p.position.z - oz, false, COLORS.teammate);
      continue;
    }
    drawPlayerDot(ctx, x, y, COLORS.teammate);
  }

  if (local) drawPlayerDot(ctx, cx, cy, COLORS.player);
}

function drawPlayerDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Pin an off-screen entity to the radar rim as a small arrow pointing toward
 * it. dx/dz are the entity's position relative to the radar center (player).
 */
function drawEdgeArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dx: number,
  dz: number,
  big: boolean,
  color: string = COLORS.elite,
): void {
  const angle = Math.atan2(dz, dx);
  const rim = Math.min(cx, cy) - 5;
  const x = cx + Math.cos(angle) * rim;
  const y = cy + Math.sin(angle) * rim;
  const size = big ? 5 : 3.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2); // point the triangle outward
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.8, size);
  ctx.lineTo(-size * 0.8, size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
