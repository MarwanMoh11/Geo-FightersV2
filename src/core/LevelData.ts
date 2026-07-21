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

/**
 * A data-gate in the arena wall: where enemies pour in from. Shared source
 * of truth for LevelSystem (gate visuals + telegraph), TimelineSpawner
 * (spawn positions), and FinaleBoss (gate sealing).
 */
export interface ArenaGate {
  id: string;
  /** Which wall the gate sits in — used for "wall breach" line events. */
  wall: 'n' | 's' | 'e' | 'w';
  x: number;
  z: number;
  /** Inward-facing normal (unit). */
  nx: number;
  nz: number;
  /** Opening width along the wall. */
  width: number;
}

// Border wall thickness
const WALL_THICKNESS = 6;

// --- STAGE 1: THE PIT ---
// Binding-of-Isaac-scale arena: one handcrafted 140×140 room where every
// corner is visible, memorized in ten seconds, and intentional. Enemies
// enter through eight data-gates in the walls; the maglev lane crosses the
// center (keep |z| < 6 clear of props); breach vaults hold the corners.
const PIT_SIZE = 140;
const PIT_HALF = PIT_SIZE / 2;

export const PIT_GATES: ArenaGate[] = [
  { id: 'gate_n1', wall: 'n', x: -35, z: -PIT_HALF, nx: 0, nz: 1, width: 12 },
  { id: 'gate_n2', wall: 'n', x: 35, z: -PIT_HALF, nx: 0, nz: 1, width: 12 },
  { id: 'gate_s1', wall: 's', x: -35, z: PIT_HALF, nx: 0, nz: -1, width: 12 },
  { id: 'gate_s2', wall: 's', x: 35, z: PIT_HALF, nx: 0, nz: -1, width: 12 },
  { id: 'gate_e1', wall: 'e', x: PIT_HALF, z: -35, nx: -1, nz: 0, width: 12 },
  { id: 'gate_e2', wall: 'e', x: PIT_HALF, z: 35, nx: -1, nz: 0, width: 12 },
  { id: 'gate_w1', wall: 'w', x: -PIT_HALF, z: -35, nx: 1, nz: 0, width: 12 },
  { id: 'gate_w2', wall: 'w', x: -PIT_HALF, z: 35, nx: 1, nz: 0, width: 12 },
];

export const LEVEL_THE_PIT: LevelConfig = {
  name: 'THE PIT',
  mapWidth: PIT_SIZE,
  mapHeight: PIT_SIZE,
  spawnPoint: { x: 0, z: 16 },
  groundTexture: '/textures/environments/ground_asphalt.jpg',
  backgroundColor: 0x0a0a12,

  obstacles: [
    // === BORDER WALLS (tall — this is a pit, not a curb) ===
    {
      id: 'wall_n',
      x: 0,
      z: -PIT_HALF - WALL_THICKNESS / 2,
      width: PIT_SIZE + WALL_THICKNESS * 2,
      depth: WALL_THICKNESS,
      height: 9,
      type: 'wall',
      blocking: true,
    },
    {
      id: 'wall_s',
      x: 0,
      z: PIT_HALF + WALL_THICKNESS / 2,
      width: PIT_SIZE + WALL_THICKNESS * 2,
      depth: WALL_THICKNESS,
      height: 9,
      type: 'wall',
      blocking: true,
    },
    {
      id: 'wall_e',
      x: PIT_HALF + WALL_THICKNESS / 2,
      z: 0,
      width: WALL_THICKNESS,
      depth: PIT_SIZE,
      height: 9,
      type: 'wall',
      blocking: true,
    },
    {
      id: 'wall_w',
      x: -PIT_HALF - WALL_THICKNESS / 2,
      z: 0,
      width: WALL_THICKNESS,
      depth: PIT_SIZE,
      height: 9,
      type: 'wall',
      blocking: true,
    },

    // === CORNER VAULTS (Phase 1.96 breach nodes — positions mirrored in
    // BreachSystem's node registry; keep them in sync) ===
    // ARMORY: NW bunker
    {
      id: 'armory',
      x: -52,
      z: -52,
      width: 16,
      depth: 16,
      height: 12,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    // DATA BANK: NE vault
    {
      id: 'databank',
      x: 52,
      z: -52,
      width: 16,
      depth: 14,
      height: 10,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    // SUBSTATION: SW power block
    {
      id: 'substation',
      x: -52,
      z: 52,
      width: 14,
      depth: 14,
      height: 8,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_rust.jpg',
    },
    // STASH DEN: SE smuggler front
    {
      id: 'stashden',
      x: 52,
      z: 52,
      width: 13,
      depth: 13,
      height: 7,
      type: 'wall',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },

    // === SUPPLY DEPOTS: wall-inset vending machines, one per wall ===
    {
      id: 'vending_1',
      x: 0,
      z: -60,
      width: 10,
      depth: 4,
      height: 5,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    {
      id: 'vending_2',
      x: 0,
      z: 60,
      width: 10,
      depth: 4,
      height: 5,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    {
      id: 'vending_3',
      x: 60,
      z: 20,
      width: 4,
      depth: 10,
      height: 5,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },
    {
      id: 'vending_4',
      x: -60,
      z: -20,
      width: 4,
      depth: 10,
      height: 5,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_vending.png',
    },

    // === MID-FIELD COVER (sparse — the horde needs room to flow) ===
    // Central plinth: THE CORE monument base
    {
      id: 'statue_base',
      x: 0,
      z: -20,
      width: 10,
      depth: 10,
      height: 3,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/deck_metalplates.jpg',
    },
    // Cargo containers: diagonal cover, clear of the z=0 maglev lane
    {
      id: 'container_1',
      x: -26,
      z: 18,
      width: 12,
      depth: 6,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
    {
      id: 'container_2',
      x: 26,
      z: -16,
      width: 12,
      depth: 6,
      type: 'prop',
      blocking: true,
      asset: '/textures/environments/prop_metal.jpg',
    },
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
let currentLevel: LevelConfig = LEVEL_THE_PIT;

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
