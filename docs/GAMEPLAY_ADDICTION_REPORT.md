# GeoFighters — Gameplay Report: Making It Insanely Addictive

Research-driven feature roadmap for taking GeoFighters from "solid survivors-like"
to "can't-stop-playing". Every recommendation is mapped to the existing codebase
so it's an implementation plan, not a wish list.

---

## 1. The addiction formula (what the research says)

Vampire Survivors' creator built slot machines before games, and its design
follows four rules that every hit in this genre copies:

1. **Never let 5 seconds pass without a reward.** XP shards, level-ups, chests,
   gold — something good is always arriving or about to arrive.
2. **Escalating power fantasy.** The player must *feel* the curve from
   "vulnerable" to "screen-filling god" every single run — and the game's job is
   to compress that arc so it peaks right before the end.
3. **The unlock carrot.** The single biggest driver of "one more run" is not the
   run itself — it's the *next unlock*: a character, weapon, stage, or modifier
   that is visibly locked with a visible condition.
4. **Player-controlled risk (the greed dial).** Systems like VS's Curse let
   players bet their safety for faster rewards — near-misses are the tension
   engine that makes the reward release feel earned.

**GeoFighters' current state against this formula:**

| Pillar | Status |
| --- | --- |
| Reward cadence | ✅ Good — XP streaks, chests, credits, level-ups |
| Power fantasy | ✅ Good — 10 weapons + evolutions, overloads |
| Unlock carrot | ❌ **Missing** — all 3 characters and all content available from minute one |
| Greed dial | ❌ **Missing** — difficulty is adaptive (FlowStateManager) but never player-chosen |
| Day-2 retention hooks | ❌ **Missing** — no daily run, no achievements, no leaderboard |
| Run variety | ⚠️ Partial — anomaly zones exist; one arena, one timeline |

The gaps are exactly the systems that turn a good 20-minute session into a
30-day habit. That's the roadmap.

---

## 2. Tier 1 — In-run dopamine (highest impact ÷ effort)

### 2.1 Unlock & achievement system ("the carrot engine") — **the #1 feature**

Lock most content behind visible, chase-able goals. VS ships hundreds of
achievements where *every single one unlocks something*; players report chasing
unlocks long after runs stop being hard.

- Lock **2 of the 3 characters** (LASH: "deal 50,000 total damage", RAIL:
  "survive to 8:00"). New players get a goal in their first minute.
- Add **4–6 new locked characters** (see 3.2) with conditions like "evolve any
  weapon", "open 20 chests", "win a run", "kill 10,000 enemies lifetime".
- Lock **3–4 weapons** out of the level-up pool until earned ("kill 500 enemies
  with orbitals" unlocks the next orbital-class weapon).
- Show a **toast the moment a condition completes** (the Toast component from
  the portal work is already global) and an unlock ceremony on the game-over
  screen — the *end of a failed run must still pay out*.

*Implementation:* new `src/core/AchievementRegistry.ts` with
`{ id, description, condition(stats), unlocks }`; lifetime stats accumulate in
`uiState`/localStorage (the persistence pattern already exists for credits and
permanent upgrades). Gate `MainMenu.svelte` character cards and the
`UpgradeSystem` pool on unlock state. The game-over screen lists progress
toward the 3 nearest unlocks — that line is what triggers "one more run".

### 2.2 The greed dial: **Corruption meter** (VS's Curse, adapted)

An opt-in risk slider set before each run (0–5): each level = +enemy spawn
rate, +enemy HP, but **+20% XP, +25% credits, +chest rarity** per level. The
adaptive `FlowStateManager` already exposes a `pressure` target — Corruption
simply raises `targetPressure` and multiplies loot, so this is nearly free to
build and instantly creates self-set challenge goals ("I can clear C3, can I
clear C4?"). Halls of Torment's Agony system proves this loop carries hundreds
of hours.

### 2.3 Slot-machine chest ceremony

Chests currently resolve instantly. Make them the game's jackpot moment, VS
style: freeze gameplay, spin through items with rising pitch (the audio
engine's `chimeRun` is built for this), then reveal **1 / 3 / 5 items** with
weighted odds (5-item jackpot ~5%, preceded by a near-miss shake). This is the
single highest dopamine-per-line-of-code change available; the reveal animation
lives entirely in a new `ChestModal.svelte` + `ChestSystem` hook.

### 2.4 Kill-combo meter + milestone callouts

A visible combo counter (kills within 2s chain it) with escalating screen
effects at 50/100/250, plus run milestones ("LEVEL 10", "10,000 DAMAGE",
"BOSS 50% HP") flashed as HUD callouts with the streak-pitch audio. Zero new
systems — `CollisionSystem` already counts kills; this is UI + audio garnish on
existing events, and it directly attacks pillar #1 (something every 5 seconds).

---

## 3. Tier 2 — Run variety ("every run feels different")

### 3.1 Data protocols (Arcana-style run modifiers)

At run start (and again at 5:00 from a special chest), pick 1 of 3
**Protocols** — build-warping rules, not stat bumps:

- *Overclock Loop*: weapons fire 2× but cooldown-based weapons overheat
- *Mirror Process*: projectiles duplicate at 30% damage
- *Scavenger Daemon*: enemies explode into credit sparks, magnets weaken
- *Glass Kernel*: +100% damage, max HP capped at 50%

VS players consider Arcanas "the biggest game-changer in the game" because they
multiply build space: 12 protocols × existing weapons ≈ hundreds of distinct
runs. *Implementation:* `ProtocolRegistry` mirroring `PassiveRegistry`'s shape;
most effects hook the same stat pipeline `PassiveEffectsSystem` already applies.

### 3.2 Character roster expansion (3 → 8–10)

Characters are the cheapest content multiplier: each is stats + starting weapon
+ one quirk (the `cypher|lash|rail` pattern in `factories.ts` generalizes).
Examples: a character whose overload triggers automatically at low HP; one that
can't take passives but gets +1 weapon slot; one that starts with a random
evolved weapon but 1 HP ("glass cannon lottery"). Every one ships with an
unlock condition (2.1) — roster page with silhouetted locked slots.

### 3.3 Second arena + remixed timeline

`LevelData.ts` already supports multiple `LevelConfig`s (a debug arena exists)
and `SpawnTimeline` is data-driven. One new arena ("Data Core" — tight
corridors vs. the Slums' open blocks) with a re-ordered enemy timeline and a
different 8:00 boss pattern doubles perceived content. Unlock: win a run.

### 3.4 Timed greed events (mid-run spikes)

Every ~90s, a 15-second event spawns: a **credit golem** that flees (chase =
payout), a **shrine** that must be stood on while enemies flood in (channel =
free evolution roll), a **corrupted courier** elite trailing XP. These create
the risk/reward micro-decisions that Deep Rock Survivor's mining and VS's light
sources provide. *Implementation:* extend `AnomalySystem` — it already spawns
and expires zone entities on a timer.

---

## 4. Tier 3 — Day-2+ retention (the web-portal wedge)

### 4.1 Daily run (seeded) — **the most important retention feature for portals**

One attempt per day, same seed for every player: fixed character, fixed
protocol, fixed corruption. Score posts to a daily leaderboard. Research on
streak psychology is unambiguous — players hate breaking chains, and daily
runs are the genre-standard implementation (every major roguelite has one).
On CrazyGames this pairs directly with their SDK's data/leaderboard APIs — and
"daily content" is an editorial promotion criterion there.
*Implementation:* seeded RNG wrapper (the spawn timeline and upgrade rolls take
a seed), date-keyed localStorage for the attempt lock, portal SDK hook in the
existing `src/core/portal.ts`.

### 4.2 Achievements page + collection log

Surface 2.1 in the menu: bestiary (enemies killed), weapon mastery bars
(kills per weapon → cosmetic tints at thresholds), evolution recipe log that
fills in as discovered (the `GrimoireModal` already exists — extend it from
recipe guide to *collection tracker*, which converts it from reference material
into a completion itch).

### 4.3 Three daily quests

"Kill 300 with AoE weapons", "Open 5 chests", "Reach 6:00 at Corruption 2+" —
each pays credits (the shop economy already exists as the sink). Quests
re-roll daily and stack with the daily run for a 5-minute-minimum session
every day.

---

## 5. Tier 4 — The co-op differentiator

GeoFighters already has something Vampire Survivors *doesn't*: **online co-op**.
Almost no web survivors-like has it. Lean in:

- **Endless mode after victory** — at 10:00, "STAY IN THE SYSTEM?" → scaling
  chaos until party wipe; best time on the leaderboard. (Solo too — currently
  victory just ends; endless converts the win into a score chase.)
- **Downed-state revives** — a dead teammate becomes a revivable core for 30s;
  clutch revives are the moments people bring friends back for. Research shows
  playing with a real-life friend lifts D7 retention ~40%.
- **Shared greed events** (3.4) that need two players standing on two plates.

---

## 6. Suggested build order

| Milestone | Features | Why this order |
| --- | --- | --- |
| **M1 — "The Carrot"** | 2.1 unlocks/achievements, 2.4 combo + callouts, 2.3 chest ceremony | Pure retention lift on existing content; no balance risk |
| **M2 — "The Dial"** | 2.2 Corruption, 3.2 first 3 new characters, endless mode | Adds challenge ceiling + roster carrot |
| **M3 — "The Variety"** | 3.1 protocols, 3.4 greed events, 3.3 second arena | Multiplies run diversity once players are hooked |
| **M4 — "The Habit"** | 4.1 daily run + leaderboard, 4.3 quests, 4.2 collection log | Daily hooks land best when there's content depth behind them |
| **M5 — "The Friends"** | 5 co-op revives + shared events | Differentiator; polish after core loop is proven |

A useful internal metric: after M1, a new player's first three deaths should
each display at least one unlock earned and one "almost unlocked" tease. That's
the "one more run" test.

---

## 7. Sources

- [Vampire Survivors design analysis — power fantasy & reward cadence](https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors)
- [HackerNoon — the gambling psychology behind Vampire Survivors](https://hackernoon.com/the-vampire-survivors-effect-how-developers-utilize-gambling-psychology-to-create-addictive-games)
- [Vampire Survivors wiki — Arcana system](https://vampire.survivors.wiki/w/Arcanas) and [secrets/unlock design](https://vampire.survivors.wiki/w/Secrets)
- [PCGamesN — VS character unlock conditions](https://www.pcgamesn.com/vampire-survivors/unlock-characters)
- [GameDesignSkills — 17 proven player retention strategies](https://gamedesignskills.com/game-design/player-retention/)
- [UX Magazine — the psychology of streak design](https://uxmag.medium.com/the-psychology-of-hot-streak-game-design-how-to-keep-players-coming-back-every-day-without-shame-3dde153f239c)
- [Feature Upvote — retention strategies from top games](https://featureupvote.com/blog/game-retention/)
- Genre survey: [Eneba — best survivors-likes 2026](https://www.eneba.com/hub/games/games-like-vampire-survivors/) (Brotato, Halls of Torment, Death Must Die, DRG: Survivor)
