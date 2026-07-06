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

| # | Bug | Where | Effort |
|---|-----|-------|--------|
| 0.1 | **Music scheduler interval leak** — `startMusic()` creates a new `setInterval` on every call and never stores/clears it. Every menu→run→menu cycle stacks another永 interval; they all keep firing (CPU + battery) and multiply schedule work when music resumes. Store the handle; create once or clear on stop. | `src/core/audio.ts:393` | S |
| 0.2 | **5 of 8 characters have no space-bar ability.** Overload charge builds and the button fires for NOVA, BYTE, GHOST, TITAN, FLUX — and nothing happens. Implemented: cypher (shockwave), rail (bubble + 4× fire), lash (tears + speed). Design + implement the missing five (suggestions: NOVA = expanding gravity-well that pulls enemies; BYTE = magnet-vortex that vacuums all XP/credits on map; GHOST = 4s phase-walk, untargetable + speed; TITAN = ground slam, radial knockback + armor buff; FLUX = chaos roulette that re-rolls into a random doubled ult). | `src/systems/OverloadSystem.ts` | L |
| 0.3 | **"Play again" reloads the page** (`location.reload()` in GameOverModal). In co-op this destroys the room and kicks the party. Implement a real run-reset (return party to lobby, reset world state in place). Also required for mobile stores — full reloads feel broken in a wrapped app. | `src/ui/modals/GameOverModal.svelte`, factories/GameState | M |
| 0.4 | **Repo hygiene:** 3 untracked 13–22 MB `Firefox … profile.json` files in the root (add to .gitignore); pre-existing prettier/lint errors in `LevelData.ts`, `PlayerStats.ts`, `OverloadSystem.ts`; heavy `any` usage in systems (tighten gradually). | root, various | S |
| 0.5 | **Leaderboard durability + abuse:** HF free-tier storage is ephemeral (board wipes on rebuild/sleep) and POST has no rate-limit or profanity filter. Move storage to a durable free tier (Supabase/Neon/Cloudflare KV) or at least periodic JSON backup; add per-IP rate limit + name filter. | `server.js` | M |

## Phase 1 — Battery & performance (mobile-critical)

The engine already has: quality tiers (auto/low/med/high), adaptive dynamic
resolution, instanced enemies/particles/loot, spatial-hash separation, throttled
minimap/HUD. Remaining wins, in impact order:

| # | Item | Detail | Effort |
|---|------|--------|--------|
| 1.1 | **Frame-rate cap** | rAF currently runs at display refresh — observed 160 fps on a 165 Hz monitor; a phone at 120 Hz burns battery for zero gameplay benefit in a 60 fps-class game. Add a frame limiter (accumulate dt, skip render below budget): settings **30 / 60 / Uncapped**, default 60, and auto-30 when `navigator.getBattery()` reports save-mode/low battery ("Battery saver"). | M |
| 1.2 | **Menu/pause power mode** | The full 3D scene renders at max fps behind the menu and while paused. Cap menu/paused rendering at ~30 fps (or render-on-demand). Biggest idle-drain fix. | S |
| 1.3 | **Force websocket transport** | socket.io defaults to long-polling first; `transports: ['websocket']` cuts handshake chatter and radio wake-ups. | S |
| 1.4 | **`powerPreference` hint** | Pass `powerPreference: 'high-performance'` on desktop, `'default'` on mobile when creating the renderer, so phones don't pin the big GPU core. | S |
| 1.5 | **Audio idle suspend** | When muted/backgrounded, `ctx.suspend()` instead of only zeroing gains — a running AudioContext keeps a hardware audio thread alive. (Resume-on-focus already exists.) | S |
| 1.6 | **Asset budget check** | rapier wasm chunk is 2 MB gz — acceptable, but lazy-load it after first paint on portals (loading bar already staged). | M |

## Phase 2 — Multiplayer resilience (make co-op shippable-quality)

Already done this cycle: party lobby w/ ready-up, ghosts/revives, kill
scoreboard, chest routing, per-player protocols, host-authoritative damage with
per-client hit feedback, client combat FX (impacts, knockback, death FX,
sounds), boss-bullet sync, WebRTC P2P state sync (RELAY fallback + HUD chip),
snapshot spawn amortization. Remaining:

| # | Item | Detail | Effort |
|---|------|--------|--------|
| 2.1 | **Host-drop handling** | Today: host disconnect = run dies instantly. Minimum: 10s grace + "HOST LOST — run ended" summary screen with the scoreboard instead of a hard menu bounce. Full host *migration* (authority transfer) is a stretch goal — only attempt after launch. | M (grace) / XL (migration) |
| 2.2 | **Client reconnection grace** | A 1-second blip currently removes the player. Server keeps the slot 15s; client auto-rejoins with its connId and resumes. | M |
| 2.3 | **TURN server** | ~10–15% of NAT pairs can't do P2P and stay on the relay. Cloudflare Calls TURN (free tier) or Metered.ca (free 50 GB) → near-100% direct connections. | S |
| 2.4 | **Always-on signaling for launch** | HF free tier sleeps (first join = ~50 s cold start — feels broken). At launch move `server.js` to an always-on $5 tier (Railway/Fly/Render paid) or keep HF but add a menu "waking server…" state. | S |
| 2.5 | **Same-party rematch** | After game over, return the whole party to the lobby (pairs with 0.3). | Included in 0.3 |
| 2.6 | **Remote ult visuals** | Teammates currently don't see your overload effect. Broadcast `ult-fired {char}` and play the visual on all screens. | S/M |
| 2.7 | **Enemy damage numbers on clients** | Client shows no numbers over enemies it shoots (it doesn't know the rolls). Either include per-hit damage in a light event batch, or accept as a known cosmetic delta. | M / skip |

## Phase 3 — Content & retention (what makes them come back)

| # | Item | Detail | Effort |
|---|------|--------|--------|
| 3.1 | Missing 5 ultimates (0.2) — biggest character-fantasy gap. | | (counted above) |
| 3.2 | **Stage 2** | One arena today. The timeline/level registries were built for more — a second map (new palette, obstacle set, spawn timeline, new elite) doubles perceived content for ~L effort. | L |
| 3.3 | **Meta depth** | Shop unlock previews, starting-loadout pick (weapon + passive), 2–3 more achievements-gated characters/weapons. Hooks all exist. | M |
| 3.4 | **Resume-run** | Persist solo run state every 30 s; offer "Continue?" after crash/refresh. Mobile OSes kill background tabs constantly — this is near-mandatory for stores. | M |
| 3.5 | **Accessibility** | Colorblind-safe enemy/rarity palettes, text scale, reduced-flash mode (damage vignette toggle). Store reviewers look for this. | M |
| 3.6 | **Localization** | Strings are hardcoded English. Extract to a dictionary; machine-translate top 10 languages (portals serve global traffic; CrazyGames is majority non-English). | L |
| 3.7 | **Cloud save** | Credits/unlocks live in localStorage — wiped on reinstall. Piggyback the leaderboard server with a save-blob endpoint keyed by a generated player ID (later: Play Games / Game Center sign-in). | M |

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
   - *Second Chance:* on death, watch ad → revive at 50% HP once per run (co-op: self-revive as the ghost).
   - *Double Ceremony:* after a chest, watch ad → re-roll or double the rewards.
   - *Daily boost:* +50% credits for the next run.
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

| Week | Deliverables |
|------|--------------|
| 1 | Phase 0 bugs (0.1, 0.3, 0.4, 0.5) + battery items 1.1–1.5 + MP items 2.3, 2.4, 2.6 |
| 2 | Five missing ultimates (0.2) + host-drop grace & reconnection (2.1, 2.2) + AdsProvider + CrazyGames submission w/ rewarded revive |
| 3 | Resume-run, accessibility, cloud save (3.4, 3.5, 3.7) + Poki/GD/itch submissions + TWA on Play (ad-only) |
| 4–5 | Capacitor builds (Android w/ AdMob+Billing, then iOS) + store assets/policies + QA matrix |
| 6+ | Stage 2, localization, season-pass-lite, host migration — fueled by live metrics |

**North star:** portal revenue starts week 2–3; mobile stores by week 5–6; keep
solo-first fun (most sessions will be solo) while co-op is the shareable hook.
