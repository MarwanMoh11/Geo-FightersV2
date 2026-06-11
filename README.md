# GeoFighters ⚡

[![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/three.js%20-%23000000.svg?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Svelte](https://img.shields.io/badge/svelte-%23f1413d.svg?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**GeoFighters** is a Vampire Survivors-inspired cyberpunk survival shooter built with **Three.js**, **Svelte 5**, **Rapier physics**, and **Miniplex-style ECS**. Survive 10 minutes inside a corrupted system: mow down hordes, level up, build a weapon loadout, evolve it, and outlast the SYSTEM CORRUPTION boss.

## 🎮 How to Play

| Input                   | Action |
| ----------------------- | ------ |
| `W` `A` `S` `D`         | Move   |
| `ESC` / pause button    | Pause  |
| Touch joystick (mobile) | Move   |

Your weapons **fire automatically** — positioning is everything.

- Defeated enemies drop **XP shards**; level up to choose from weapons and passive upgrades (6 slots each).
- **Elites and mini-bosses** drop chests — open them for upgrades or **weapon evolutions** when you hold the matching passive.
- At **8:00** the SYSTEM CORRUPTION boss emerges and floods the arena. Survive to **10:00** to win.

## ✨ Features

- 🔫 **10 base weapons + 10 evolutions** — directional, AoE, orbital, and global categories with per-level scaling.
- 🧬 **12 passive modules** that shape your build and unlock evolutions.
- 🌊 **Timeline-driven horde spawning** with escalating waves, elites, mini-bosses, and a finale boss.
- ⚙️ **Rapier physics** (WASM) for collisions, with a WebGPU renderer + WebGL2 fallback.
- 💥 **Game feel** — i-frames with sprite blink, knockback, hit flashes, screen shake, damage vignette, magnetized pickups with streak audio, expanding blast rings.
- 🖥️ **Svelte 5 UI** — glassmorphism HUD, minimap, inventory with live cooldown sweeps, upgrade/pause/settings/game-over modals, mobile controls.
- 🔊 **Procedural WebAudio** soundtrack and SFX — zero audio files.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation & Development

```bash
npm install
npm run dev
```

Add `?debug` to the URL to enable developer tools (debug panel via `Shift+Alt+D`, `C` to spawn test chests, verbose logging).

### Production Build

```bash
npm run build
npm run preview
```

### Quality Checks

```bash
npm run lint          # ESLint
npm run check         # svelte-check (Svelte + TS diagnostics)
npm run format:check  # Prettier (includes .svelte)
```

## 🏗️ Project Structure

- `src/core/` — ECS world, renderer, registries (weapons/passives/evolutions), audio, settings, game/UI state.
- `src/systems/` — gameplay systems: input, player control, enemies, weapons, collisions, loot, chests, waves, boss, camera, particles, UI sync.
- `src/ui/` — Svelte 5 components: HUD, inventory, main menu, modals, mobile controls.
- `public/` — sprites, environment textures, and UI art.

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ by Marwan
