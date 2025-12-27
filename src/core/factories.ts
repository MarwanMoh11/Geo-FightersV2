import * as THREE from 'three';
import { world } from './world';
import { loadTexture } from './assets';
import { STARTER_WEAPON } from './definitions';

const shadowGeo = new THREE.CircleGeometry(0.4, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
const xpGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const xpMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

export function spawnPlayer(scene: THREE.Scene) {
  const playerGroup = new THREE.Group();
  scene.add(playerGroup);

  const texture = loadTexture('/sprites/player/player_robot.png');
  const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
  const sprite = new THREE.Sprite(material);

  const BASE_HEIGHT = 2.5;
  sprite.scale.set(BASE_HEIGHT, BASE_HEIGHT, 1);
  sprite.position.y = BASE_HEIGHT / 2;

  const interval = setInterval(() => {
    if (texture.image) {
      const img = texture.image as HTMLImageElement;
      const h = img.height;
      if (h > 0) {
        const aspect = img.width / h;
        sprite.scale.set(BASE_HEIGHT * aspect, BASE_HEIGHT, 1);
        clearInterval(interval);
      }
    }
  }, 100);

  playerGroup.add(sprite);
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

      // --- VISUAL MAPPING ---
      bulletWidth: STARTER_WEAPON.width,
      bulletLength: STARTER_WEAPON.length,

      bulletCount: STARTER_WEAPON.count,
      bulletSpread: STARTER_WEAPON.spread,
      knockback: STARTER_WEAPON.knockback,
      bulletPierce: STARTER_WEAPON.pierce,
    },
  });
}

export function spawnEnemy(scene: THREE.Scene, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  const texture = loadTexture('/sprites/enemies/enemy_glitch.png').clone();
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
  const sprite = new THREE.Sprite(material);
  const BASE_HEIGHT = 2.0;
  sprite.scale.set(BASE_HEIGHT, BASE_HEIGHT, 1);
  sprite.position.y = BASE_HEIGHT / 2;
  const interval = setInterval(() => {
    if (texture.image) {
      const img = texture.image as HTMLImageElement;
      const h = img.height;
      if (h > 0) {
        const aspect = img.width / h;
        sprite.scale.set(BASE_HEIGHT * aspect, BASE_HEIGHT, 1);
        clearInterval(interval);
      }
    }
  }, 100);
  group.add(sprite);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  group.add(shadow);
  world.add({
    isEnemy: true,
    position: group.position,
    velocity: new THREE.Vector3(0, 0, 0),
    health: { current: 12, max: 12 },
    transform: group,
    aimTarget: new THREE.Vector3(),
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
