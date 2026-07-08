// --- LEVEL DATA ---
// Defines level layouts, obstacles, and map configuration for collision and rendering

// --- TYPES ---
export interface Obstacle {
  id: string;
  x: number; // Center X position
  z: number; // Center Z position
  width: number; // Size on X axis
  depth: number; // Size on Z axis
  height?: number; // Visual height (for rendering)
  type: 'wall' | 'prop';
  asset?: string; // Texture/sprite path for visual rendering
  blocking: boolean; // Whether it blocks player/enemy movement
  halfWidth?: number; // Precalculated
  halfDepth?: number; // Precalculated
}

export interface LevelConfig {
  name: string;
  mapWidth: number; // Total playable width
  mapHeight: number; // Total playable depth (Z axis)
  spawnPoint: { x: number; z: number };
  groundTexture?: string;
  backgroundColor: number;
  obstacles: Obstacle[];
}

// --- CONSTANTS ---
export const MAP_HALF_WIDTH = 400; // 800 / 2
export const MAP_HALF_HEIGHT = 400; // 800 / 2

// Border wall thickness
const WALL_THICKNESS = 5;

// --- LEVEL 1: NEON BLOCK SLUMS ---
export const LEVEL_1_NEON_SLUMS: LevelConfig = {
  name: 'Neon Block Slums',
  mapWidth: 800,
  mapHeight: 800,
  spawnPoint: { x: 0, z: 50 }, // Center of Neon Courtyard area
  groundTexture: '/textures/environments/ground_asphalt.jpg',
  backgroundColor: 0x0a0a12, // Very dark blue-black

  obstacles: [
    // === BORDER WALLS ===
    // North Wall
    {
      id: 'wall_n',
      x: 0,
      z: -MAP_HALF_HEIGHT - WALL_THICKNESS / 2,
      width: 800 + WALL_THICKNESS * 2,
      depth: WALL_THICKNESS,
      type: 'wall',
      blocking: true,
    },
    // South Wall
    {
      id: 'wall_s',
      x: 0,
      z: MAP_HALF_HEIGHT + WALL_THICKNESS / 2,
      width: 800 + WALL_THICKNESS * 2,
      depth: WALL_THICKNESS,
      type: 'wall',
      blocking: true,
    },
    // East Wall
    {
      id: 'wall_e',
      x: MAP_HALF_WIDTH + WALL_THICKNESS / 2,
      z: 0,
      width: WALL_THICKNESS,
      depth: 800,
      type: 'wall',
      blocking: true,
    },
    // West Wall
    {
      id: 'wall_w',
      x: -MAP_HALF_WIDTH - WALL_THICKNESS / 2,
      z: 0,
      width: WALL_THICKNESS,
      depth: 800,
      type: 'wall',
      blocking: true,
    },

    // === INDUSTRIAL GATE (Northwest) ===
    // Zone: x=-400 to -250, z=-400 to -200
    // Large gate structures creating chokepoint
    {
      id: 'gate_left',
      x: -375,
      z: -320,
      width: 40,
      depth: 60,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    {
      id: 'gate_right',
      x: -290,
      z: -320,
      width: 40,
      depth: 60,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    // Conveyor/machinery blocking side passage
    { id: 'conveyor', x: -360, z: -240, width: 70, depth: 20, type: 'prop', blocking: true },
    // Warning lights area
    { id: 'machinery', x: -280, z: -220, width: 30, depth: 30, type: 'prop', blocking: true },

    // === MAIN STREET (North-Center to East) ===
    // Zone: x=-200 to 400, z=-400 to -200
    // Wide street with scattered obstacles
    // Abandoned taxis
    {
      id: 'taxi_1',
      x: -100,
      z: -350,
      width: 25,
      depth: 45,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    {
      id: 'taxi_2',
      x: 80,
      z: -320,
      width: 25,
      depth: 45,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    {
      id: 'taxi_3',
      x: 250,
      z: -360,
      width: 25,
      depth: 45,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    // Security barricades (long thin obstacles)
    { id: 'barrier_1', x: -50, z: -280, width: 80, depth: 8, type: 'prop', blocking: true },
    { id: 'barrier_2', x: 150, z: -270, width: 100, depth: 8, type: 'prop', blocking: true },
    { id: 'barrier_3', x: 320, z: -290, width: 60, depth: 8, type: 'prop', blocking: true },
    // Street vendor carts
    { id: 'cart_1', x: 0, z: -220, width: 20, depth: 20, type: 'prop', blocking: true },
    { id: 'cart_2', x: 200, z: -230, width: 20, depth: 20, type: 'prop', blocking: true },

    // === SCRAP YARDS (Southwest) ===
    // Zone: x=-400 to -180, z=-150 to 400
    // Tight maze-like corridors
    // Outer wall creating the "yard" enclosure
    { id: 'scrap_wall_n', x: -310, z: -150, width: 170, depth: 4, type: 'wall', blocking: true },
    { id: 'scrap_wall_e', x: -180, z: 100, width: 4, depth: 490, type: 'wall', blocking: true },
    // Internal maze walls (thinner for better gameplay)
    { id: 'maze_1', x: -350, z: -50, width: 4, depth: 150, type: 'wall', blocking: true },
    { id: 'maze_2', x: -280, z: 50, width: 130, depth: 4, type: 'wall', blocking: true },
    { id: 'maze_3', x: -220, z: -80, width: 4, depth: 120, type: 'wall', blocking: true },
    { id: 'maze_4', x: -300, z: 180, width: 4, depth: 200, type: 'wall', blocking: true },
    { id: 'maze_5', x: -240, z: 250, width: 110, depth: 4, type: 'wall', blocking: true },
    // Dead end pocket
    { id: 'deadend_s', x: -380, z: 280, width: 4, depth: 100, type: 'wall', blocking: true },
    { id: 'deadend_e', x: -340, z: 330, width: 90, depth: 4, type: 'wall', blocking: true },
    // Scrap piles (smaller, scattered)
    {
      id: 'scrap_1',
      x: -330,
      z: 0,
      width: 25,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_rust.jpg',
    },
    {
      id: 'scrap_2',
      x: -260,
      z: 120,
      width: 30,
      depth: 20,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_rust.jpg',
    },
    {
      id: 'scrap_3',
      x: -350,
      z: 200,
      width: 20,
      depth: 30,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_rust.jpg',
    },
    // Broken mech
    {
      id: 'mech',
      x: -370,
      z: 100,
      width: 35,
      depth: 35,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_rust.jpg',
    },
    // Cargo containers
    {
      id: 'container_1',
      x: -280,
      z: -20,
      width: 50,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    {
      id: 'container_2',
      x: -210,
      z: 150,
      width: 50,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },

    // === NEON COURTYARD (Southeast/Center) ===
    // Zone: x=-150 to 400, z=-150 to 400
    // Semi-open plaza with scattered props
    // Central statue pedestal (the holo-statue decor sits on top of it)
    {
      id: 'statue_base',
      x: 100,
      z: 100,
      width: 22,
      depth: 22,
      height: 4,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/deck_metalplates.jpg',
    },
    // Vending machines along edges
    {
      id: 'vending_1',
      x: -50,
      z: 50,
      width: 15,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    {
      id: 'vending_2',
      x: 250,
      z: 80,
      width: 15,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    {
      id: 'vending_3',
      x: 180,
      z: 300,
      width: 15,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    {
      id: 'vending_4',
      x: -80,
      z: 280,
      width: 15,
      depth: 25,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    // Benches
    {
      id: 'bench_1',
      x: 30,
      z: 150,
      width: 30,
      depth: 10,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_bench.png',
    },
    {
      id: 'bench_2',
      x: 170,
      z: 180,
      width: 30,
      depth: 10,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_bench.png',
    },
    {
      id: 'bench_3',
      x: 50,
      z: 250,
      width: 30,
      depth: 10,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_bench.png',
    },
    {
      id: 'bench_4',
      x: 280,
      z: 200,
      width: 30,
      depth: 10,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_bench.png',
    },
    // Narrow exit corridor walls (creating funnels) - thinner
    { id: 'exit_nw_1', x: -120, z: -50, width: 60, depth: 4, type: 'wall', blocking: true },
    { id: 'exit_nw_2', x: -120, z: 0, width: 60, depth: 4, type: 'wall', blocking: true },
    { id: 'exit_ne', x: 350, z: -100, width: 4, depth: 80, type: 'wall', blocking: true },
    { id: 'exit_se', x: 350, z: 350, width: 4, depth: 80, type: 'wall', blocking: true },
    { id: 'exit_sw', x: -130, z: 370, width: 4, depth: 50, type: 'wall', blocking: true },

    // === MARKET ROW (Main Street) ===
    // Stall line gives the long street rhythm + cover against ranged elites
    {
      id: 'stall_1',
      x: -40,
      z: -390,
      width: 30,
      depth: 14,
      height: 5,
      type: 'prop',
      blocking: true,
    },
    {
      id: 'stall_2',
      x: 40,
      z: -390,
      width: 30,
      depth: 14,
      height: 5,
      type: 'prop',
      blocking: true,
    },
    {
      id: 'stall_3',
      x: 130,
      z: -390,
      width: 30,
      depth: 14,
      height: 5,
      type: 'prop',
      blocking: true,
    },

    // === WATCHTOWER (Industrial Gate) ===
    // Tall landmark visible across the north — orients the player instantly
    {
      id: 'watchtower',
      x: -332,
      z: -368,
      width: 26,
      depth: 26,
      height: 22,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },

    // === HOLO-BILLBOARD TOWERS (Courtyard entrance) ===
    {
      id: 'billboard_1',
      x: -150,
      z: -120,
      width: 14,
      depth: 14,
      height: 14,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    {
      id: 'billboard_2',
      x: 380,
      z: 60,
      width: 14,
      depth: 14,
      height: 14,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },

    // === TRANSITION CORRIDORS ===
    // Between Industrial Gate and Scrap Yards
    { id: 'trans_1', x: -380, z: -180, width: 30, depth: 4, type: 'wall', blocking: true },
    // Between Main Street and Courtyard
    { id: 'trans_2', x: -140, z: -180, width: 4, depth: 50, type: 'wall', blocking: true },
    { id: 'trans_3', x: 50, z: -180, width: 4, depth: 40, type: 'wall', blocking: true },
  ],
};

// --- LEVEL DEBUG: SANDBOX ---
export const LEVEL_DEBUG: LevelConfig = {
  name: 'Debug Sandbox',
  mapWidth: 2000,
  mapHeight: 2000,
  spawnPoint: { x: 0, z: 0 },
  groundTexture: '/textures/environments/ground_grid.png', // Fallback to solid if missing
  backgroundColor: 0x222222,
  obstacles: [
    // Just border walls to prevent falling off world
    {
      id: 'debug_wall_n',
      x: 0,
      z: -1000 - WALL_THICKNESS / 2,
      width: 2000 + WALL_THICKNESS * 2,
      depth: WALL_THICKNESS,
      type: 'wall',
      blocking: true,
    },
    {
      id: 'debug_wall_s',
      x: 0,
      z: 1000 + WALL_THICKNESS / 2,
      width: 2000 + WALL_THICKNESS * 2,
      depth: WALL_THICKNESS,
      type: 'wall',
      blocking: true,
    },
    {
      id: 'debug_wall_e',
      x: 1000 + WALL_THICKNESS / 2,
      z: 0,
      width: WALL_THICKNESS,
      depth: 2000,
      type: 'wall',
      blocking: true,
    },
    {
      id: 'debug_wall_w',
      x: -1000 - WALL_THICKNESS / 2,
      z: 0,
      width: WALL_THICKNESS,
      depth: 2000,
      type: 'wall',
      blocking: true,
    },
  ],
};

// Helper: Get current level config (for future multi-level support)
let currentLevel: LevelConfig = LEVEL_1_NEON_SLUMS;

export function getCurrentLevel(): LevelConfig {
  // Precalculate halfWidth/halfDepth for obstacles if not present
  for (const obs of currentLevel.obstacles) {
    if (obs.halfWidth === undefined) obs.halfWidth = obs.width / 2;
    if (obs.halfDepth === undefined) obs.halfDepth = obs.depth / 2;
  }
  return currentLevel;
}

export function setCurrentLevel(level: LevelConfig): void {
  currentLevel = level;
}

// Helper: Get all blocking obstacles for collision
export function getBlockingObstacles(): Obstacle[] {
  return currentLevel.obstacles.filter((obs) => obs.blocking);
}

// Helper: Check if a point is inside an obstacle (AABB)
export function isPointInObstacle(x: number, z: number, obstacle: Obstacle): boolean {
  const halfW = obstacle.width / 2;
  const halfD = obstacle.depth / 2;
  return (
    x >= obstacle.x - halfW &&
    x <= obstacle.x + halfW &&
    z >= obstacle.z - halfD &&
    z <= obstacle.z + halfD
  );
}

// Helper: Check AABB collision between entity and obstacle
export function checkAABBCollision(
  entityX: number,
  entityZ: number,
  entityRadius: number,
  obstacle: Obstacle,
): { colliding: boolean; pushX: number; pushZ: number } {
  const halfW = obstacle.halfWidth ?? obstacle.width / 2;
  const halfD = obstacle.halfDepth ?? obstacle.depth / 2;

  // Early-out broadphase: check if the circle can possibly intersect the AABB
  const dx = entityX - obstacle.x;
  if (Math.abs(dx) >= halfW + entityRadius) {
    return { colliding: false, pushX: 0, pushZ: 0 };
  }
  const dz = entityZ - obstacle.z;
  if (Math.abs(dz) >= halfD + entityRadius) {
    return { colliding: false, pushX: 0, pushZ: 0 };
  }

  // Find closest point on obstacle to entity center
  const closestX = Math.max(obstacle.x - halfW, Math.min(entityX, obstacle.x + halfW));
  const closestZ = Math.max(obstacle.z - halfD, Math.min(entityZ, obstacle.z + halfD));

  // Distance from entity center to closest point
  const cdx = entityX - closestX;
  const cdz = entityZ - closestZ;
  const distSq = cdx * cdx + cdz * cdz;

  if (distSq < entityRadius * entityRadius) {
    // Collision! Calculate push vector
    const dist = Math.sqrt(distSq);
    if (dist === 0) {
      // Entity center is inside obstacle, push in any direction
      return { colliding: true, pushX: entityRadius, pushZ: 0 };
    }
    const overlap = entityRadius - dist;
    const nx = cdx / dist;
    const nz = cdz / dist;
    return {
      colliding: true,
      pushX: nx * overlap,
      pushZ: nz * overlap,
    };
  }

  return { colliding: false, pushX: 0, pushZ: 0 };
}
