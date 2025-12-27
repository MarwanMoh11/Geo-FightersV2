import * as THREE from 'three';
import { world } from './world';
import { loadTexture } from './assets';
import { STARTER_WEAPON } from './definitions';

// --- SHARED RESOURCES ---
const shadowGeo = new THREE.CircleGeometry(0.4, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
const xpGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const xpMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

// --- ENEMY DEFINITIONS (Restored) ---
export const EnemyType = {
  GLITCH: 'glitch',
  VIRUS: 'virus',
  FIREWALL: 'firewall',
} as const;

export type EnemyType = (typeof EnemyType)[keyof typeof EnemyType];

type EnemyStats = { hp: number; speed: number; size: number; color: number; xp: number };

const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  [EnemyType.GLITCH]: { hp: 12, speed: 2.0, size: 2.0, color: 0xffffff, xp: 10 },
  [EnemyType.VIRUS]: { hp: 5, speed: 4.5, size: 1.5, color: 0xffff00, xp: 5 },
  [EnemyType.FIREWALL]: { hp: 40, speed: 1.0, size: 3.5, color: 0xff0055, xp: 30 },
};

export function spawnPlayer(scene: THREE.Scene) {
  const playerGroup = new THREE.Group();
  scene.add(playerGroup);

  const textureRight = loadTexture('/sprites/player/player_robot.png');

  // Clone texture for left-facing sprite and flip it horizontally
  const textureLeft = textureRight.clone();
  textureLeft.repeat.x = -1;
  textureLeft.offset.x = 1;
  textureLeft.needsUpdate = true;

  // Create two sprites - one for each facing direction
  const materialRight = new THREE.SpriteMaterial({ map: textureRight, color: 0xffffff });
  const materialLeft = new THREE.SpriteMaterial({ map: textureLeft, color: 0xffffff });

  const spriteRight = new THREE.Sprite(materialRight);
  const spriteLeft = new THREE.Sprite(materialLeft);

  // Name them for easy identification
  spriteRight.name = 'spriteRight';
  spriteLeft.name = 'spriteLeft';

  const BASE_HEIGHT = 2.5;
  spriteRight.scale.set(BASE_HEIGHT, BASE_HEIGHT, 1);
  spriteRight.position.y = BASE_HEIGHT / 2;

  // Left sprite uses same positive scale (flipping is via texture)
  spriteLeft.scale.set(BASE_HEIGHT, BASE_HEIGHT, 1);
  spriteLeft.position.y = BASE_HEIGHT / 2;
  spriteLeft.visible = false; // Start facing right

  const interval = setInterval(() => {
    if (textureRight.image) {
      const img = textureRight.image as HTMLImageElement;
      const h = img.height;
      if (h > 0) {
        const aspect = img.width / h;
        spriteRight.scale.set(BASE_HEIGHT * aspect, BASE_HEIGHT, 1);
        spriteLeft.scale.set(BASE_HEIGHT * aspect, BASE_HEIGHT, 1);
        clearInterval(interval);
      }
    }
  }, 100);

  playerGroup.add(spriteRight);
  playerGroup.add(spriteLeft);

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  playerGroup.add(shadow);

  // 1. CREATE PLAYER
  const player = world.add({
    isPlayer: true,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    input: { x: 0, y: 0, isShooting: false },
    aimTarget: new THREE.Vector3(),
    transform: playerGroup,
    spriteRight: spriteRight,
    spriteLeft: spriteLeft,
    facingRight: true,

    level: 1,
    xp: 0,
    xpMax: 100,
    score: 0,
    health: { current: 50, max: 50 },
    modifiers: { damageAdd: 0, fireRateMult: 1.0, speedMult: 1.0 },
  });

  // 2. EQUIP STARTER WEAPON
  world.add({
    isWeapon: true,
    ownerId: player.id,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),

    weapon: {
      cooldownTimer: 0,
      fireRate: STARTER_WEAPON.fireRate,
      damage: STARTER_WEAPON.damage,
      bulletSpeed: STARTER_WEAPON.speed,
      bulletColor: STARTER_WEAPON.color,
      bulletLifetime: STARTER_WEAPON.range,

      bulletWidth: STARTER_WEAPON.width,
      bulletLength: STARTER_WEAPON.length,
      visualStyle: STARTER_WEAPON.visualStyle,

      bulletCount: STARTER_WEAPON.count,
      bulletSpread: STARTER_WEAPON.spread,
      knockback: STARTER_WEAPON.knockback,
      bulletPierce: STARTER_WEAPON.pierce,
    },
  });
}

// --- CACHE & TYPES ---
interface CachedEnemyAsset {
  texture: THREE.Texture;        // Standard left-facing texture
  textureFlipped: THREE.Texture; // Flipped right-facing texture
  materialTemplate: THREE.SpriteMaterial;
  aspect: number;
}
const assetCache: Partial<Record<EnemyType, CachedEnemyAsset>> = {};

// Helper to get or create assets for a specific enemy type
function getEnemyAssets(type: EnemyType): CachedEnemyAsset {
  if (!assetCache[type]) {
    // 1. Determine Texture Path
    const textureName = `enemy_${type}`;
    const texturePath = `/sprites/enemies/${textureName}.png`;

    // 2. Load Standard Texture (Left Facing)
    const texture = loadTexture(texturePath);
    texture.magFilter = THREE.NearestFilter;

    // 3. Create Flipped Texture (Right Facing)
    const textureFlipped = texture.clone();
    textureFlipped.repeat.x = -1;
    textureFlipped.offset.x = 1;
    textureFlipped.needsUpdate = true;

    // 4. Create Template Material
    const stats = ENEMY_STATS[type];
    const mat = new THREE.SpriteMaterial({ map: texture, color: stats.color });

    // 5. Init Entry
    assetCache[type] = {
      texture,
      textureFlipped,
      materialTemplate: mat,
      aspect: 1.0,
    };

    // 6. Start Aspect Poller
    // We only need to check one texture since they share the image source
    const entry = assetCache[type]!;
    const interval = setInterval(() => {
      const img = entry.texture.image as HTMLImageElement;
      if (img && img.height > 0) {
        entry.aspect = img.width / img.height;
        clearInterval(interval);
      }
    }, 100);
  }
  return assetCache[type]!;
}

export function spawnEnemy(
  scene: THREE.Scene,
  x: number,
  z: number,
  type: EnemyType = EnemyType.GLITCH,
) {
  const stats = ENEMY_STATS[type];
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  // 1. Get Assets (texture is cached, material template is reference only)
  const assets = getEnemyAssets(type);

  // 2. Create TWO materials and sprites - one for each facing direction
  // Optimization: Use cached textures instead of cloning per instance
  const materialRight = new THREE.SpriteMaterial({
    map: assets.textureFlipped, // Flipped (Right-facing if original is Left)
    color: stats.color,
  });
  const materialLeft = new THREE.SpriteMaterial({
    map: assets.texture, // Standard (Left-facing)
    color: stats.color,
  });

  const spriteRight = new THREE.Sprite(materialRight);
  const spriteLeft = new THREE.Sprite(materialLeft);

  // Name them for identification
  spriteRight.name = 'spriteRight';
  spriteLeft.name = 'spriteLeft';

  // 4. Apply Scale using helper aspect
  const img = assets.texture.image as HTMLImageElement;
  if (assets.aspect === 1.0 && img && img.height > 0) {
    assets.aspect = img.width / img.height;
  }

  spriteRight.scale.set(stats.size * assets.aspect, stats.size, 1);
  spriteRight.position.y = stats.size / 2;

  // Left sprite uses same positive scale (flipping is via texture)
  spriteLeft.scale.set(stats.size * assets.aspect, stats.size, 1);
  spriteLeft.position.y = stats.size / 2;
  spriteLeft.visible = false; // Start facing right

  group.add(spriteRight);
  group.add(spriteLeft);

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.setScalar(stats.size / 2);
  shadow.position.y = 0.05;
  group.add(shadow);

  world.add({
    isEnemy: true,
    position: group.position,
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: stats.hp, max: stats.hp },
    moveSpeed: stats.speed,
    transform: group,
    spriteRight: spriteRight,
    spriteLeft: spriteLeft,
    facingRight: true,
    aimTarget: new THREE.Vector3(),
    xpValue: stats.xp,
  });
}

export function spawnXP(scene: THREE.Scene, x: number, z: number, value: number) {
  const mesh = new THREE.Mesh(xpGeometry, xpMaterial);
  mesh.position.set(x, 0.5, z);
  scene.add(mesh);
  const angle = Math.random() * Math.PI * 2;
  const force = 2;
  const velocity = new THREE.Vector3(Math.cos(angle) * force, 5.0, Math.sin(angle) * force);
  world.add({
    isXP: true,
    position: mesh.position,
    velocity: velocity,
    xpValue: value,
    transform: mesh,
  });
}
