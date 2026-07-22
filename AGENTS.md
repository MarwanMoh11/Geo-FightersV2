# Geo Fighters 2.0 — Agent Guide

## Dev Environment

- **Node >= 20** required (Vite 7). System Node is 18 — use nvm:
  ```
  export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22
  ```
- **Dev server**: `npm run dev` (vite, port 5173 by default)
- **Typecheck**: `npx tsc --noEmit` (works regardless of Node version)
- **Svelte check**: `npm run check` (needs Node >= 20, may fail in this shell)
- **Build**: `npm run build` → `tsc && vite build`
- **Lint**: `npm run lint` (eslint)
- **Format**: `npm run format` (prettier)

## Architecture

Custom ECS (`src/core/world.ts`):

- Entities are plain objects with optional boolean flags (`isEnemy`, `isPlayer`, `isProjectile`…) and data fields (`position`, `velocity`, `health`…)
- `world.add(e) → entity` (auto-assigns `id`, indexes flags). `world.remove(e)` uses O(1) swap-remove via `idIndex` map
- `world.with('isEnemy', 'position', 'health')` returns a generator over the smallest matching index set, filtering with `every()` closure — **expensive in hot loops**
- ⚠️ **Hot-loop rule**: never call `world.with()` inside an inner loop (e.g. per bullet). Materialize into a module-level array once per frame
- Properties set AFTER `world.add` (e.g. `entity.rigidBody = ...`) are NOT tracked by index Sets — the index only captures what existed at add time

System order in `src/main.ts`:
```
InputSystem → AimSystem → PlayerControlSystem
EnemySystem
TimelineSpawnerSystem
WeaponSystem
CollisionSystem
PhysicsSystem → LifecycleSystem → RenderSystem → ParticleSystem
```

## ECS Entity Skeleton

Key flags and fields used by systems:
- `isEnemy`, `isPlayer`, `isProjectile`, `isParticle`, `isXP`, `isCredit`, `isOrbital`
- `position: Vector3`, `velocity: Vector3`, `health: { current, max }`
- `transform?: Object3D` — scene graph node (players, boss, projectiles, chests). NOT set on instanced enemies
- `rotationY?: number` — facing direction for instanced enemies (set by EnemySystem)
- `rigidBody?: RAPIER.RigidBody` — only players and boss (enemies/projectiles have none)

## ECS Perf Rules (hard-earned)

- **Nested `world.with()` = slowdown**: always materialize enemies/players into arrays before nested sweeps
- **`world.remove` was O(n) splice**: now O(1) swap-remove, but the `id` must match the auto-assigned one — network-synced entities that overwrite their `id` break removal (old `indexOf` handled reference identity)
- **ECS indexes only update at `world.add`/`world.remove`**: post-add property assignments (like `entity.rigidBody = ...`) don't affect indexes
- **y-clamp** `entity.position.y = 0.5` in PhysicsSystem overrides particle Y movement — particles never actually bounce, despite bounce dead-code in ParticleSystem

## Performance — VS-Style Tricks (this repo's approach)

All enemies are "instanced-only" — no per-enemy scene graph nodes, Rapier bodies, or separation:
- EnemySystem: pure position/velocity steering, no spatial hash, no transform sync
- CollisionSystem: 4u spatial grid rebuilt each frame from materialized enemy array
- RenderSystem: InstancedMesh (solid + glow + wire), blob shadows, distance-culled at 50u
- PhysicsSystem: skips movement for entities that own their own position (isEnemy → EnemySystem, isXP → LootSystem, etc.)
- No projectile Rapier bodies — all hits via distance sweep
- Dynamic detail: wire layer >700 enemies, blob shadows >900, render cull at 50u

## Quirks

- **Quality tiers** (`src/core/quality.ts`): low/medium/high control shadows (off/512/1024), bloom (high only), particle scale, minimap interval, pixel ratio caps. Dynamic resolution scaling adapts on AUTO tier
- **Shadow map at 30Hz** (renderer.ts): `autoUpdate=false`, throttled refresh. Enemy solid mesh has `castShadow=false` (blob shadows handle it)
- **Rapier is initialized at runtime** — `isRapierInitialized()` can return false early in the startup sequence. Guard every Rapier call
- **Network sync overwrites entity.id**: `spawnEnemy` assigns an auto-id, then `network.ts` overwrites it with the host's id — breaks `world.get()` and `world.remove()` (which now uses id→slot map instead of reference identity)
