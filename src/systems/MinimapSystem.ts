// --- MINIMAP SYSTEM ---
// Renders a top-down view of the level showing obstacles, player, and enemies

import { world } from '../core/world';
import { getBlockingObstacles } from '../core/LevelData';

// Canvas and context references
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

// Map scale: how many world units per pixel
const SCALE = 800 / 150;  // 800 world units / 150 canvas pixels

// Colors
const COLORS = {
    background: '#0a0a15',
    wall: '#3a3a4a',
    prop: '#4a4a5a',
    player: '#00ffff',
    enemy: '#ff0055',
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
        console.log('[MINIMAP] Initialized');
    } else {
        console.warn('[MINIMAP] Canvas not found');
    }
}

/**
 * Update the minimap every frame
 */
export function MinimapSystem(): void {
    if (!ctx || !canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Clear canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    // Draw border
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Draw obstacles
    const obstacles = getBlockingObstacles();
    for (const obs of obstacles) {
        // Skip border walls (too far out to display nicely)
        if (obs.id.startsWith('wall_')) continue;

        const x = worldToMapX(obs.x, centerX);
        const y = worldToMapZ(obs.z, centerY);
        const w = obs.width / SCALE;
        const h = obs.depth / SCALE;

        ctx.fillStyle = obs.type === 'wall' ? COLORS.wall : COLORS.prop;
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
    }

    // Draw XP shards (small green dots)
    for (const xp of world.with('isXP', 'position')) {
        const x = worldToMapX(xp.position.x, centerX);
        const y = worldToMapZ(xp.position.z, centerY);

        // Only draw if on map
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
            ctx.fillStyle = COLORS.xp;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw chests (orange diamonds)
    for (const chest of world.with('isChest', 'position')) {
        const x = worldToMapX(chest.position.x, centerX);
        const y = worldToMapZ(chest.position.z, centerY);

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
            ctx.fillStyle = COLORS.chest;
            ctx.beginPath();
            ctx.moveTo(x, y - 3);
            ctx.lineTo(x + 3, y);
            ctx.lineTo(x, y + 3);
            ctx.lineTo(x - 3, y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw enemies (red dots)
    for (const enemy of world.with('isEnemy', 'position')) {
        const x = worldToMapX(enemy.position.x, centerX);
        const y = worldToMapZ(enemy.position.z, centerY);

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
            ctx.fillStyle = COLORS.enemy;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw player (cyan triangle pointing in movement direction)
    const player = world.with('isPlayer', 'position').first;
    if (player) {
        const x = worldToMapX(player.position.x, centerX);
        const y = worldToMapZ(player.position.z, centerY);

        // Player triangle
        ctx.fillStyle = COLORS.player;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Outer glow ring
        ctx.strokeStyle = COLORS.player;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * Convert world X coordinate to minimap X coordinate
 */
function worldToMapX(worldX: number, centerX: number): number {
    return centerX + (worldX / SCALE);
}

/**
 * Convert world Z coordinate to minimap Y coordinate
 */
function worldToMapZ(worldZ: number, centerY: number): number {
    return centerY + (worldZ / SCALE);
}
