# GeoFighters — Launch & Monetization Master Plan

**Goal:** ship GeoFighters as a revenue-generating, multiplatform game — web game
portals + PWA first (fastest money), then Google Play and the App Store — while
keeping solo and co-op play smooth on everything from a flagship phone to a
2015 laptop.

**State of the codebase (audited 2026-07):** the engine core is strong — ECS
(miniplex) + three.js with instanced rendering, Rapier physics, procedural
audio, an adaptive graphics-quality system with dynamic resolution, a full
party-lobby co-op stack over WebRTC P2P with socket.io fallback, leaderboard
backend, PWA install + service worker, and CrazyGames portal hooks. What
remains is (1) a short list of real bugs, (2) battery/performance hardening,
(3) multiplayer resilience, (4) content depth for retention, and (5) the
store/monetization work itself.

Effort key: **S** ≤ half a day · **M** 1–2 days · **L** ≥ 3 days

---

## Phase 0 — Bugs to fix before anything else (P0)

> **Status (2026-07-06): COMPLETE except 0.5's durable-storage half.**

| #   | Bug                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where                           | Effort | Status                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------ | ------------------------- |
| 0.1 | **Music scheduler interval leak** — the lookahead `setInterval` was immortal (kept waking the CPU forever after music stopped) and `startMusic` couldn't re-arm. Handle now stored + cleared in `stopMusic`.                                                                                                                                                                                                                                                                                       | `src/core/audio.ts`             | S      | ✅ `e1fc310`              |
| 0.2 | **5 of 8 characters had no space-bar ability.** Shipped: NOVA Singularity (gravity well + core grinder), BYTE Salvage Vortex (map-wide loot vacuum), GHOST Phase Shift (4s untouchable sprint), TITAN Seismic Slam (quake + knockback + armor plate), FLUX Chaos Surge (nuke/frenzy/heal/gold roulette). Per-char durations, announce callouts, damage host/solo-gated for co-op. Bonus: fixed latent bug where never-hit enemies were immune to Cypher's nuke (blast query required `stunTimer`). | `src/systems/OverloadSystem.ts` | L      | ✅ `e1fc310`              |
| 0.3 | **"Play again" reloaded the page.** New `src/core/runReset.ts` sweeps all run entities + physics bodies, resets every stateful module (clock, spawner, anomalies, flow, upgrade queue, boss, leaderboard once-guard), and lands on MENU in one frame; MP leaves the room cleanly. Wired into GameOver + Pause modals. Verified: second run on the same page is fully fresh.                                                                                                                        | `src/core/runReset.ts`          | M      | ✅ `1203f15`              |
| 0.4 | **Repo hygiene:** Firefox captures gitignored; repo-wide prettier pass → 0 lint errors (105 `any` warnings remain — tighten gradually).                                                                                                                                                                                                                                                                                                                                                            | root, various                   | S      | ✅                        |
| 0.5 | **Leaderboard durability + abuse:** POST clamps input but storage is ephemeral on HF free tier and there's no per-IP rate limit / profanity filter. Needs a durable store (Supabase/Neon/Cloudflare KV — owner to provision) + server-side limiter.                                                                                                                                                                                                                                                | `server.js`                     | M      | ⏸️ pending service choice |

## Phase 1 — Battery & performance (mobile-critical)

> **Status (2026-07-07): 1.1–1.5 SHIPPED; 1.6 deferred.**
> Measured on a 165 Hz display: menu 160→30 fps, in-game 160→59 fps (default).

The engine already has: quality tiers (auto/low/med/high), adaptive dynamic
resolution, instanced enemies/particles/loot, spatial-hash separation, throttled
minimap/HUD. Remaining wins, in impact order:

| #   | Item                          | Detail                                                                                                                                                                                                                                                                                                                                 | Effort | Status   |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1.1 | **Frame-rate cap**            | Frame limiter in the game loop skips frames before any work happens (clock keeps accumulating → simulation stays real-time). Settings → Display → **FPS LIMIT 30/60/MAX**, default 60. Dynamic resolution is skipped when intentionally capped ≤30 so the cap isn't misread as GPU overload. Verified: 30→31fps, 60→59fps, MAX→164fps. | M      | ✅       |
| 1.2 | **Menu/pause power mode**     | Anything outside PLAYING is force-capped at 30 fps regardless of the setting. Verified: menu reads 30 (was 160).                                                                                                                                                                                                                       | S      | ✅       |
| 1.3 | **Websocket-first transport** | `transports: ['websocket','polling']` — skips the long-polling handshake, keeps polling as a strict-proxy fallback.                                                                                                                                                                                                                    | S      | ✅       |
| 1.4 | **`powerPreference` hint**    | All three renderer constructors: `'low-power'` on mobile, `'high-performance'` on desktop.                                                                                                                                                                                                                                             | S      | ✅       |
| 1.5 | **Audio idle suspend**        | Backgrounding now suspends the AudioContext (not just gain=0) — releases the OS audio hardware thread; resume on focus restores it.                                                                                                                                                                                                    | S      | ✅       |
| 1.6 | **Asset budget check**        | rapier wasm chunk is 2 MB gz — acceptable, but lazy-load it after first paint on portals (loading bar already staged).                                                                                                                                                                                                                 | M      | deferred |

## Phase 1.5 — Character & enemy identity, full animation, menu personality

The biggest single phase of the plan. Today the game is mechanically deep but
visually anonymous: all 8 characters share one identical cyan drone (only the
core sphere is tinted), every enemy of every type hovers in perfect lockstep
with zero body language, and the menus are clean but sterile. This phase gives
the game a _face_ — the thing store screenshots, portal thumbnails, and
word-of-mouth actually sell — without adding a single asset download or
regressing the Phase 1 battery work.

> **Status (2026-07-08): 1.5.1–1.5.5 SHIPPED.** Verified live: 61 fps at the
> 60-cap with ~150 animated enemies on screen, zero console errors, typecheck
> and build clean. Enemies remain fully instanced.

**Hard performance rules for everything below:**

- Enemies stay 100% instanced — animation happens inside the per-instance
  matrix composition (extra `sin()` calls, zero extra draw calls or materials).
- No per-frame allocations; all animation driven by accumulated `dt` so the
  frame limiter and menu 30 fps cap keep working.
- Menu personality is CSS-only (GPU-composited transforms/opacity), honors
  `prefers-reduced-motion`.
- Visual richness scales through the existing quality tiers where it costs
  anything.

| #     | Item                              | Detail                                                                                                                                                                                                                                                                                                                                                                               | Effort | Status |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ |
| 1.5.1 | **Per-character visual identity** | Character theme table in `factories.ts`: full-rig tinting (core, wing tips, visor, gyro rings, thruster flames, shield shards) from `character.color` + per-character silhouette (wing span, shell scale/shape, shard count, thruster size) so CYPHER/TITAN/GHOST/etc. read differently at a glance. Applied to local player _and_ remote teammates (`applyCharacterTint` upgraded). | L      | ✅     |
| 1.5.2 | **Full player animation set**     | State-driven body language in `RenderSystem`: fire recoil kick + barrel flash, hit flinch scale-punch, death power-down (tumble, sink, flames die), level-up flourish, ult overdrive mode (gyros spin up, flames lengthen, core pulses), velocity banking roll. Triggers stamped by `WeaponSystem`/`LootSystem` as cheap timers on the entity.                                       | L      | ✅     |
| 1.5.3 | **Instanced enemy animation**     | Per-instance phase offset (from entity id) breaks the hover lockstep; per-type motion signatures — glitch jitters, virus pulses & spins, firewall stomps, enforcer sways, colossus heaves, warden wobbles fast, hydra undulates, overseer breathes; spawn-in scale pop; hit scale-punch. All inside the existing matrix compose loop.                                                | L      | ✅     |
| 1.5.4 | **Menu & UI personality**         | Character-select cards themed per character color (glow, border, icon halo), wordmark shimmer, ambient drifting backdrop, hover/press micro-interactions, lobby roster tinted by pick. CSS-only.                                                                                                                                                                                     | M      | ✅     |
| 1.5.5 | **Performance verification**      | fps unchanged at 60-cap and menu-30 with a full horde on screen; typecheck + build clean.                                                                                                                                                                                                                                                                                            | S      | ✅     |

## Phase 1.75 — Character re-modelling (one true model per fighter)

Phase 1.5 gave the shared drone rig per-character colors and proportions;
Phase 1.75 replaces it outright: **each of the 8 fighters is its own
procedurally-built model.** All rigs keep the shared part-naming convention
(core, wings, thrusters, fire cones, gyro rings, barrels, shieldShard_N), so
the entire Phase 1.5 animation state machine — recoil, flinch, death
power-down, level-up flourish, ult overdrive, banking — drives every model
with zero per-character code in RenderSystem. Geometries stay pooled;
materials are per-player and disposed on rebuild (`applyCharacterModel`).

| Fighter | Model identity                                                                                                                   | Status |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CYPHER  | Classic swept-wing interceptor (refined baseline): visor array, twin engines, dual gyros                                         | ✅     |
| LASH    | Blade craft: forward-swept scythe wings, V tail fins, single hot engine, twitching claw prongs                                   | ✅     |
| RAIL    | Industrial gunship: slab hull + cabin, top-mounted twin-rail cannon that pumps like pistons, wide stabilizers, exposed reactor   | ✅     |
| NOVA    | Mystic star: swollen core in three off-axis resonance rings (incl. new third ring), floating channeling pylons, 4 orbiting motes | ✅     |
| BYTE    | Satellite: octagonal bus, uplink dish + blinking beacon antenna, solar-panel wings, 5 orbiting drone cubes                       | ✅     |
| GHOST   | Phantom dart: translucent stretched fuselage + fins, glowing eye-core, single long-burn engine, halo ring                        | ✅     |
| TITAN   | Walking fortress: armored slab with sloped glacis, pauldrons, recessed reactor, dual siege cannons, huge engines                 | ✅     |
| FLUX    | The gambler: mismatched wing vs canard, one heavy + one tiny engine, off-axis rings, two tumbling orbit dice                     | ✅     |

RenderSystem gained rig-agnostic hooks (no per-character branches): per-wing
resting yaw, per-barrel resting position, single-engine flame support, third
gyro ring, per-rig shard count/orbit radius.

## Phase 1.8 — Enemy re-modelling & visual fidelity

The 8 player rigs now have real identity; the enemies haven't caught up — they
read as lumps of primitives with flat baked colors. This phase gives every
enemy the Phase 1.75 treatment **inside the instancing constraints** (merged
geometry per type, per-instance matrix animation, no per-instance materials),
plus the two cheapest global renderer wins the engine is missing.

> **Status (2026-07-08): 1.8.A bestiary + B1/B2/B3/B4/B5 SHIPPED; B6/B7 deferred.**
> Verified live: 59–61 fps at the 60-cap with 185–221 redesigned enemies on
> screen (identical to pre-change), env lighting + bloom active on the
> WebGPURenderer/WebGL2-backend path that real players hit, zero console
> errors. Draw calls: +1 glow layer per type, +1 aura mesh total. Per-spawn
> cost went DOWN (enemies no longer build invisible scene-graph meshes).

**The instancing trick that makes this free:** the render path already
supports a second geometry layer per enemy type (today only GLITCH's
wireframe uses it). Generalizing it into an emissive **glow layer** (additive
material, same instance matrices) gives every enemy glowing eyes, cores,
seams and vents at exactly +1 draw call per type — with zero per-enemy cost.
Geometry detail is also nearly free: 500 instances share one mesh, so richer
silhouettes and baked vertex-color _gradients_ (dark base → hot tip) cost
almost nothing.

### 1.8.A — Enemy redesigns (malware bestiary, strongest silhouettes first)

| Enemy    | Role                | New identity                                                                                                                           | Effort |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| VIRUS    | fast trash          | Pathogen: sharper asymmetric spikes, hot emissive tips + inner nucleus on the glow layer, sickly body gradient                         | M      |
| GLITCH   | trash               | Corrupted fragment: jagged shard-cluster silhouette (tetra/slab shards at broken angles), glow-layer slivers that read as data tearing | M      |
| FIREWALL | slow wall           | A literal gate: monolithic frame wider than tall, burning grid inset on the glow layer, ember gradient rising up the pillars           | M      |
| ENFORCER | elite, blocks shots | Riot knight: big frontal energy shield plate (glow layer) the body hides behind — silhouette explains the mechanic                     | M      |
| COLOSSUS | elite, spawns adds  | Industrial hulk: stacked segment tower, glowing vents + cargo pods it visibly "sheds" (spawn FX ties in)                               | M      |
| WARDEN   | elite, phase-shifts | Unstable prism: crystal split into offset floating segments (permanently mid-teleport), glow seams between slices                      | M      |
| HYDRA    | miniboss            | Serpent cluster: three linked node-heads with glow-layer eyes, spine ridge connecting them                                             | M      |
| OVERSEER | miniboss            | The all-seeing eye: armored shell plates around a huge glow-layer iris that reads from across the arena                                | M      |

Animation signatures (Phase 1.5) stay and get retuned per new silhouette —
e.g. WARDEN's wobble becomes segment shear, FIREWALL's stomp gains an ember
flare on the glow layer via instance color.

### 1.8.B — Supporting fidelity (cheap, global)

| #   | Item                           | Detail                                                                                                                                                                                                                    | Effort | Tier gating             |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| B1  | **Environment map**            | `RoomEnvironment` → PMREM → `scene.environment`. One-time cost; every metallic surface (player rigs, enemy armor) stops rendering flat. The code already lowered enemy metalness to work around this — revert that after. | S      | all tiers               |
| B2  | **Bloom**                      | Threshold bloom so emissive cores/rings/flames/glow-layers actually glow. UnrealBloomPass (WebGL) / node bloom (WebGPU).                                                                                                  | M      | high tier only          |
| B3  | **Elite aura rings**           | Instanced ground decal ring under elites/minibosses — reads "dangerous" instantly.                                                                                                                                        | S      | all tiers               |
| B4  | **Spawn portals**              | Budgeted expanding-ring FX at spawn points (pairs with the existing spawn-pop).                                                                                                                                           | S      | scaled by particleScale |
| B5  | **Elite death shockwave**      | Ground ring decal burst on elite/miniboss death (trash keeps particle burst).                                                                                                                                             | S      | all tiers               |
| B6  | **Engine & projectile trails** | Pooled fading ribbon trails behind fast-moving player rigs and bullets.                                                                                                                                                   | M      | med+ tiers              |
| B7  | **Living ground**              | Subtle scrolling data-grid emissive overlay on the arena floor + boundary glow wall.                                                                                                                                      | M      | med+ tiers              |

**Order:** B1 first (it upgrades everything else's materials, including 1.8.A
as it lands) → 1.8.A bestiary → B3/B4/B5 readability set → B2 bloom → B6/B7.

**Performance rules:** enemy draw calls stay at (types × 2) worst case; no
per-instance materials; all FX budgeted through `scaleParticleCount()`; bloom
never enabled below high tier; verify 60-cap holds with a full horde before
each ship.

## Phase 1.9 — Map 1 level design: Neon Block Slums, fully developed

> **Status (2026-07-08): SHIPPED.** Verified live: 60 fps with ~300 enemies on
> the dressed map, shrine buffs firing, stash + exclusive item granted
> end-to-end, zero console errors.

Play drops you into **Neon Block Slums** (map splash announces it). The map's
four districts each read as a place and have a reason to visit.

**Real surfaces (CC0, ambientCG.com — see `public/textures/environments/CREDITS.txt`):**
tiled asphalt streets, a riveted metal-plate courtyard deck, a rusted-over
scrap-yard floor, metal-clad props. All 512px color maps, 164 KB total —
the ground/asset fields in LevelData were previously declared but never
rendered; texture loading now actually exists (cached loader in LevelSystem).

**Landmarks & dressing:** THE FOUNDER holo-statue on a plated plinth in the
courtyard (orientation landmark), market-row neon signs along Main Street
(merged into 2 draw calls), a dead maglev transit line separating street from
courtyard, a 22-unit watchtower at the Industrial Gate, holo-billboard
towers, market stalls for mid-street cover.

**Things to do (the activity layer, `ShrineSystem.ts`):**

| Activity                                         | What it is                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Pulse Shrine** (Courtyard)                     | Step on: weapons tick 1.5× for 20s, then 75s cooldown. Beacon dims while spent.                                      |
| **Aegis Shrine** (Scrap Yards, deep in the maze) | Incoming damage halved for 20s — worth the risky detour.                                                             |
| **Velocity Shrine** (Main Street)                | +25% move speed for 20s — pairs with the long open lane.                                                             |
| **Data Vault** (existing greed event)            | Now correctly reads gold again via instanced tint + gold aura (regressed by the 1.8 instancing change).              |
| **Black-Market Stash**                           | At 2:30 (solo), a smuggler crate surfaces at one of 4 landmark spots with a beacon. Restocks every 4 min in endless. |

**Map-exclusive item:** the **SCAVENGER CHIP** — only from the stash, never in
the level-up pool (`exclusive` flag in PassiveRegistry): +25% credits, credit
pickups restore 1 HP, +15% magnet. The launch-plan hook: every future map
ships one exclusive item as its collection carrot.

Performance: all dressing is static merged geometry (~20 extra draw calls
total); shrines cost one distance check each per frame; verified 60 fps
parity at ~300 enemies.

## Phase 1.95 — Level design doctrine: "The Map Comes To You"

Full research-backed design doc: **[PHASE_1_95_LEVEL_DESIGN.md](./PHASE_1_95_LEVEL_DESIGN.md)**

Phase 1.9's content was real but spatially bankrupt: an 800-unit map, a
5.5 u/s player, a ~70-unit screen — casuals orbit spawn and never see the
shrines. The doctrine (from Survivor.io / Vampire Survivors / Brotato
research): content parachutes to the player, everything off-screen gets a
HUD arrow, something good every 10 seconds, a map event every ~90 s, and
geography is flavor — never homework. Headline items: POI wayfinding arrows,
instanced destructible props, floor consumables (medkit / magnet / bomb),
player-proximate supply drops, the MAGLEV RUN train event, vending-machine
slot machines, billboard hacks, watchtower turret, mobile stash, and a
scripted first 60 seconds. Ships against a measurable casual-experience
contract with the usual zero-fps-regression rule.

## Phase 1.96 — JACK IN: enterable buildings & breach mini-games

**Status: SHIPPED-pending.** Full doc: [PHASE_1_96_JACK_IN.md](PHASE_1_96_JACK_IN.md).
Every interactable becomes an enterable node behind a glowing door: stand in it
to JACK IN and play a 10-20s Dispatch-style GridRunner breach (maze + timer +
sequence gates + antivirus chasers + fog) while the horde piles up outside.
Six node kinds with exclusive rewards (weapon upgrade token, EMP screen-clear,
district slow, chest jackpots, SCAVENGER CHIP), security levels that ramp with
run time, OVERCLOCK double-or-nothing, ICE TRACER on high-security fails,
CYPHER/BYTE hacking perks, SKELETON KEY rare drop. Replaces walk-on shrines and
vending pulls with one universal door grammar.

## Phase 1.97 — HORDE: the Vampire Survivors quota engine

**Status: SHIPPED.** The spawner is now a faithful port of VS's documented
model ([Enemies — VS wiki](https://vampire-survivors.fandom.com/wiki/Enemies)):
one wave per minute, each with a **minimum-alive quota** (14 → 210 across the
10-minute run) that is refilled instantly when kills drop the horde below it —
density is a guaranteed, escalating variable and the screen is never empty.
At quota, every tick still spawns one of each pool type. Scripted **ring traps**
(perfect closing circles, the VS flower) and **line walls** fire every minute at
:30; elites/minibosses run on a fixed chest-bearer schedule (1:30 → 9:00, HYDRA
at 5:00/9:00). Waves re-serve the same enemies bulkier (hpMult 1.0 → 2.9);
corruption/curse/party scale quota and tick rate; endless mode keeps growing
all three. Balance: fodder XP cut (VIRUS 2, GLITCH 5) to hold the VS level-up
cadence at tripled kill volume, fodder approach speeds raised (VIRUS 1.7,
GLITCH 1.1), starter weapons pierce 2 so shots plow through packs.

## Phase 1.98 — GOLDILOCKS: measured balance, not guesswork

**Status: SHIPPED.** Added a debug-only BalanceHarness (`?debug` →
`window.__balance`): a kiting/standstill bot player + 1 Hz metrics sampler
(alive-vs-quota saturation, kills/min, HP series, fps). Every change below was
driven by its measurements, iterated until the curves landed:

- **Contact damage was fake.** One flat 5 HP hit behind a global 0.8s i-frame
  (6.25 HP/s max from ANY horde size), and Rapier only fires contact-START
  events so enemies pressed against the player never re-hit. Now: direct
  contact sweep + per-enemy 1.0s cooldowns + typed damage (VIRUS 4 → OVERSEER
  20) + 0.15s stagger — density IS the threat.
- **Fodder never caught a kiting player** (measured minHp 100 through a
  215-enemy wave at speeds 1.7/1.1). Bisected: 2.4/1.9 killed the kite bot in
  6s; **2.1/1.6 is the band** — mid-game run carved 100→23 HP but survivable.
- **Weapons were NOT overpowered** — the opposite: 74 kills/min at min 6
  against the old HP curve. Softened wave hpMult (peak 2.9 → 2.2): 240
  kills/min mid, 926 late — the massacre feel.
- **Insane hordes:** quotas 20 → 360 (was 14 → 210), cap 300 → 450, swarms
  ×1.5 (rings up to 84). Measured 330-340 alive sustained at min 8, 60 fps.
- Standstill at min-6 density: ~3s convergence + ~4s to melt. Standing still
  is death, kiting is life — the VS covenant.

## Phase 2 — Multiplayer resilience (make co-op shippable-quality)

Already done this cycle: party lobby w/ ready-up, ghosts/revives, kill
scoreboard, chest routing, per-player protocols, host-authoritative damage with
per-client hit feedback, client combat FX (impacts, knockback, death FX,
sounds), boss-bullet sync, WebRTC P2P state sync (RELAY fallback + HUD chip),
snapshot spawn amortization. Remaining:

| #   | Item                                | Detail                                                                                                                                                                                                                                                | Effort                     |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 2.1 | **Host-drop handling**              | Today: host disconnect = run dies instantly. Minimum: 10s grace + "HOST LOST — run ended" summary screen with the scoreboard instead of a hard menu bounce. Full host _migration_ (authority transfer) is a stretch goal — only attempt after launch. | M (grace) / XL (migration) |
| 2.2 | **Client reconnection grace**       | A 1-second blip currently removes the player. Server keeps the slot 15s; client auto-rejoins with its connId and resumes.                                                                                                                             | M                          |
| 2.3 | **TURN server**                     | ~10–15% of NAT pairs can't do P2P and stay on the relay. Cloudflare Calls TURN (free tier) or Metered.ca (free 50 GB) → near-100% direct connections.                                                                                                 | S                          |
| 2.4 | **Always-on signaling for launch**  | HF free tier sleeps (first join = ~50 s cold start — feels broken). At launch move `server.js` to an always-on $5 tier (Railway/Fly/Render paid) or keep HF but add a menu "waking server…" state.                                                    | S                          |
| 2.5 | **Same-party rematch**              | After game over, return the whole party to the lobby (pairs with 0.3).                                                                                                                                                                                | Included in 0.3            |
| 2.6 | **Remote ult visuals**              | Teammates currently don't see your overload effect. Broadcast `ult-fired {char}` and play the visual on all screens.                                                                                                                                  | S/M                        |
| 2.7 | **Enemy damage numbers on clients** | Client shows no numbers over enemies it shoots (it doesn't know the rolls). Either include per-hit damage in a light event batch, or accept as a known cosmetic delta.                                                                                | M / skip                   |

## Phase 3 — Content & retention (what makes them come back)

| #   | Item                                                       | Detail                                                                                                                                                                                          | Effort          |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 3.1 | Missing 5 ultimates (0.2) — biggest character-fantasy gap. |                                                                                                                                                                                                 | (counted above) |
| 3.2 | **Stage 2**                                                | One arena today. The timeline/level registries were built for more — a second map (new palette, obstacle set, spawn timeline, new elite) doubles perceived content for ~L effort.               | L               |
| 3.3 | **Meta depth**                                             | Shop unlock previews, starting-loadout pick (weapon + passive), 2–3 more achievements-gated characters/weapons. Hooks all exist.                                                                | M               |
| 3.4 | **Resume-run**                                             | Persist solo run state every 30 s; offer "Continue?" after crash/refresh. Mobile OSes kill background tabs constantly — this is near-mandatory for stores.                                      | M               |
| 3.5 | **Accessibility**                                          | Colorblind-safe enemy/rarity palettes, text scale, reduced-flash mode (damage vignette toggle). Store reviewers look for this.                                                                  | M               |
| 3.6 | **Localization**                                           | Strings are hardcoded English. Extract to a dictionary; machine-translate top 10 languages (portals serve global traffic; CrazyGames is majority non-English).                                  | L               |
| 3.7 | **Cloud save**                                             | Credits/unlocks live in localStorage — wiped on reinstall. Piggyback the leaderboard server with a save-blob endpoint keyed by a generated player ID (later: Play Games / Game Center sign-in). | M               |

## Phase 4 — Platform packaging

### 4A. Web portals (fastest revenue — do first)

- **CrazyGames**: `portal.ts` SDK hooks already exist. Add: `sdk.gameplayStart/Stop` around runs, **rewarded ad hooks** (see Phase 5), `happytime()` on victory, portal-required sitelock. Submit. (S/M)
- **Poki / GameDistribution / itch.io**: same build (relative base path already configured ✓). Each has its own SDK shim — build a tiny `AdsProvider` interface with per-portal adapters. (M)
- **PWA (own domain)**: already installable (manifest + SW + offline). Add richer manifest (screenshots, categories) for Chrome's install promotion. (S)

### 4B. Google Play

- **Path A (cheapest): TWA via Bubblewrap** — wraps the PWA; Play accepts it. Requires: digital asset links, 512 icon, feature graphic, privacy policy URL, data-safety form. IAP not available in-TWA without Play Billing wiring — start ad-only. (M)
- **Path B (full): Capacitor** — real WebView app, enables AdMob + Play Billing plugins, haptics, keep-awake. Same codebase, `npm run build` → `npx cap sync android`. (L incl. store setup)
- Requirements checklist: Play Console account ($25 once), privacy policy, data-safety, content rating questionnaire, target API level compliance, 30 fps floor on a low-end test device (Quality=Low + 1.1 frame cap cover this).

### 4C. Apple App Store

- Capacitor iOS build. Apple specifics: $99/yr, ATT prompt if ads use tracking (prefer non-tracking ads to skip it), Game Center optional, WKWebView performance is good for this workload (Metal-backed WebGL). Review risk: "web wrapper" rejections are avoided by native touches — haptics (exists), GameCenter leaderboard mirror, app icon/splash, offline play (exists). (L)

### 4D. Desktop (later, optional)

- Steam via Electron/Tauri only after mobile validates; adds achievements/cloud saves expectations. (XL — defer)

## Phase 5 — Monetization design

Principle: **sell convenience and cosmetics, never leaderboard power.** The
economy hooks already exist (credits, shop, revive mechanic, daily quests,
chest ceremony).

1. **Rewarded video (all platforms — primary revenue)**
   - _Second Chance:_ on death, watch ad → revive at 50% HP once per run (co-op: self-revive as the ghost).
   - _Double Ceremony:_ after a chest, watch ad → re-roll or double the rewards.
   - _Daily boost:_ +50% credits for the next run.
   - Implementation: one `AdsProvider` interface → CrazyGames SDK / Poki SDK / AdMob adapters.
2. **Interstitials** (portals + mobile): only between runs, frequency-capped (≥3 min apart, never mid-run). Portals largely handle this themselves.
3. **IAP (Capacitor builds + web via Stripe later)**
   - Remove Ads — $2.99
   - Credit packs (cosmetic-economy pace-up) — $0.99–$4.99
   - Character mega-bundle (insta-unlock all 8) — $4.99
   - Neon skin packs (player trails/colors — new but cheap system) — $1.99
4. **Season-pass-lite** (post-launch): 30-day quest track paying cosmetics; dailies/streaks already exist as the skeleton.

Projected effort to first dollar: CrazyGames submission with rewarded revive =
**~1 week** from today's build.

## Phase 6 — Pre-launch QA matrix

- Devices: low-end Android (≤2 GB), mid iPhone, iPad, 60 Hz + 120 Hz laptops.
- Modes: solo, 2p co-op same-Wi-Fi (expect P2P chip), 2p cross-network (expect TURN/relay), host-drop, client-drop, reconnection.
- Battery test: 20-min run, screen-on drain ≤ 12%/hr target on mid-range phone (needs 1.1/1.2).
- Store passes: Lighthouse PWA ≥ 90, Play pre-launch report, TestFlight round.

---

## Suggested execution order (rough calendar)

| Week | Deliverables                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Phase 0 bugs (0.1, 0.3, 0.4, 0.5) + battery items 1.1–1.5 + MP items 2.3, 2.4, 2.6                                                |
| 2    | Five missing ultimates (0.2) + host-drop grace & reconnection (2.1, 2.2) + AdsProvider + CrazyGames submission w/ rewarded revive |
| 3    | Resume-run, accessibility, cloud save (3.4, 3.5, 3.7) + Poki/GD/itch submissions + TWA on Play (ad-only)                          |
| 4–5  | Capacitor builds (Android w/ AdMob+Billing, then iOS) + store assets/policies + QA matrix                                         |
| 6+   | Stage 2, localization, season-pass-lite, host migration — fueled by live metrics                                                  |

**North star:** portal revenue starts week 2–3; mobile stores by week 5–6; keep
solo-first fun (most sessions will be solo) while co-op is the shareable hook.
