# 🚀 GeoFighters: 2026 Tech Stack Migration Roadmap

This document outlines the strategic technical migration path to prepare **GeoFighters** for the 2026 web gaming landscape. The goal is to leverage "Next-Gen" browser capabilities to achieve console-quality performance and scale.

## 📅 Phase 1: The Rendering Revolution (WebGPU)
**Target:** Q3 2025 - Q1 2026
**Goal:** Move from WebGL to WebGPU to unlock Compute Shaders and massive instance counts.

- [ ] **Audit Materials/Shaders**: Review all current custom GLSL shaders.
- [ ] **Adopt TSL (Three.js Shading Language)**: Rewrite custom shaders using the new TSL node system required for WebGPU.
- [ ] **Switch Renderer**: Replace `THREE.WebGLRenderer` with `THREE.WebGPURenderer`.
- [ ] **Implement Compute Shaders**:
    - [ ] Move particle system logic (explosions, debris) to GPU compute jobs.
    - [ ] Move simple boid/flocking behaviors for Swarm/Horde enemies to GPU.

## ⚡ Phase 2: Physics & Logic Performance (WebAssembly)
**Target:** Q1 2026 - Q2 2026
**Goal:** Decouple game logic from the main JS thread and use compiled languages for performance hotspots.

- [ ] **Physics Migration**:
    - Current: Custom JS / Simple AABB.
    - Future: **Rapier.js** (Wasm).
    - [ ] Integrate `@dimforge/rapier3d-compat`.
    - [ ] Replace custom collision detection with Rapier rigid bodies and colliders.
- [ ] **Logic Optimization**:
    - [ ] Profile `miniplex` with 10,000 entities.
    - [ ] *Optional:* If pure JS ECS bottlenecks, migrate core systems (EnemyMovement, Collision) to **bitECS** (TypedArray-based) or write a custom Wasm module using Rust.

## 🎨 Phase 3: UI/UX Modernization
**Target:** Continuous / 2026
**Goal:** Create a rich, component-driven UI that scales with complex game features (inventory, skill trees).

- [ ] **Framework Evaluation**:
    - Option A: **React + React Three Fiber (R3F)**. Best ecosystem, declarative scene graph.
    - Option B: **Svelte 5**. Best raw performance, no Virtual DOM overhead.
- [ ] **Migration Steps**:
    - [ ] Install selected framework.
    - [ ] Port `index.html` Vanilla overlays to framework components.
    - [ ] Implement global state management (e.g., `zustand` if React, Stores if Svelte) for HP, Score, Inventory.

## 📱 Phase 4: Mobile & Performance Strategy
**Target:** Continuous
**Goal:** Ensure console-quality graphics don't kill mobile batteries.

- [ ] **WebGPU Compatibility**:
    - Android (Chrome 121+) already supports WebGPU.
    - iOS should have stable support by 2026.
    - **Action**: Implement a "Feature Detection" loading screen. If WebGPU is missing (e.g., older iPhone), strictly fall back to a simplified WebGL renderer or show a "Device Not Supported" message for the high-end version.
- [ ] **Battery & Thermal Management**:
    - [ ] **LOD System**: Aggressively reduce particle counts and visual effects on mobile.
    - [ ] **Battery Saver Mode**: Option to cap FPS at 30 or 60 and disable post-processing.
    - [ ] **Wasm Optimization**: Use `wasm-opt` to compress Rapier/logic binaries to <2MB for fast mobile data loading.
- [ ] **Touch Controls**:
    - Maintain the decoupled "Joystick + UI" architecture.
    - Ensure new UI frameworks (React/Svelte) fully support multi-touch events without ghost clicks.

## 🛠 Infrastructure & Tooling
- [ ] **Build Pipeline**: Maintain **Vite** as the core build tool.
- [ ] **Testing**: Add visual regression testing (Playwright) to ensure WebGPU output matches expectations across updates.
- [ ] **Asset Pipeline**: Automate glTF/GLB optimization (compression, draco) using `gltf-transform` in the build process.

---
*Created: Jan 11, 2026*
