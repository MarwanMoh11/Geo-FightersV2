import * as THREE from 'three';
import { world } from './world';
import { loadTexture } from './assets';

// Shared geometry/material for shadows
const shadowGeo = new THREE.CircleGeometry(0.4, 16);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.4,
});

// XP Visuals (Green Cube)
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
      const w = img.width;
      const h = img.height;
      if (h > 0) {
        const aspect = w / h;
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

  world.add({
    isPlayer: true,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    input: { x: 0, y: 0, isShooting: false },
    aimTarget: new THREE.Vector3(),
    transform: playerGroup,

    // --- STATS ---
    level: 1,
    xp: 0,
    xpMax: 100,
    score: 0,

    // BALANCE: Health 50
    health: { current: 50, max: 50 },

    weapon: {
      cooldownTimer: 0,
      // Fire Rate 0.5
      fireRate: 0.5,
      // BALANCE: Damage 4 (3 hits to kill 12 HP enemy)
      damage: 4,
      bulletSpeed: 20,
      bulletColor: 0x2de2e6,
      bulletLifetime: 2.0,
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
      const w = img.width;
      const h = img.height;
      if (h > 0) {
        const aspect = w / h;
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

  // Pop effect
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
