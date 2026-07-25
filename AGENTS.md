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
- **NEVER reassign `entity.id` after `world.add`**. `add()` mints the id and registers it in `idIndex`; stomping the field points `idIndex` at another entity's slot, and `remove()` then clobbers a live entity, over-pops the array and leaves `undefined` holes that every later `world.with()` trips over. Network mirrors keep the host's id in a **side map** (`enemyMirrors`/`chestMirrors`/… in `network.ts`) for exactly this reason. `remove()` now verifies the slot holds the entity before swapping, so a stray reassignment degrades to an O(n) scan instead of corrupting the world — but don't rely on that.
- **A component counts as present when it is neither `undefined` nor `false`.** Setting an optional flag to `false` (e.g. `isLocalPlayer: false`) used to put the entity **into** that index — which is how `InputSystem` ended up stamping the local player's input onto every remote player. Omit the key instead of setting it false.
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
- **Network mirrors key off side maps, not `entity.id`** (fixed 2026-07-26): clients keep `hostId -> entity` in `enemyMirrors`/`epMirrors`/`xpMirrors`/`chestMirrors`/`pickupMirrors` in `network.ts`. The old code overwrote `entity.id` with the host's id and corrupted the ECS — see the hot-earned rules above before touching this.
- **Co-op authority split**: the host simulates every player (it runs `PlayerControlSystem`/`CollisionSystem` for the whole party); a client simulates ONLY its local player and treats remote players as mirrors. Anything player-scoped that lives in `uiState` (credits, skeleton keys, magna-pulse) must be routed to the earner with `sendDirectEvent`, or it silently lands in the host's wallet.
- **`window.__coop`** (`?debug`) exposes the network/breach/anomaly/pickup module instances the game loop actually uses. Vite dev serves `'./core/network'` and `'/src/core/network.ts'` as *separate* instances, so a test that imports the path directly drives a second copy with its own socket and sees zero traffic.

## Model routing

- Delegate to **grunt** for bulk mechanical edits (renames, boilerplate, docstrings, find-and-replace).
- Delegate to **algo** for numeric/algorithmic work (complexity, data structures, geometry/physics math).
- Delegate to **visual** when an image/screenshot is in play (UI debugging, CSS/layout diffs).
- Delegate to **hard** only after a cheaper agent has genuinely failed on subtle logic/races/architecture.
- Hard rule: stay on the current model for long stretches. Switching models cold-starts the prompt cache and re-bills the entire context at full input rate. Delegate in bounded chunks (one cohesive task per hand-off), never per-turn.
