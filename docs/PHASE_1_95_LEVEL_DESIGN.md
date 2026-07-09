# Phase 1.95 — Level Design Doctrine: "The Map Comes To You"

> The final pre-launch content phase. Phase 1.9 built a _place_; this phase
> makes it a _game_. Everything here exists to fix one measured failure:
> **casual players never see the content we built.**
>
> **Status (2026-07-09): Tiers 1–3 core SHIPPED** — wayfinding arrows +
> minimap POIs (1.95.1), 120 instanced destructibles (1.95.2), the three
> consumables (1.95.3), player-proximate supply drops (1.95.4), the event
> scheduler with MAGLEV RUN + NEON SURGE (1.95.6/a/b), vending slot machines
> (1.95.7), mobile stash (1.95.10), and the first-minute choreography beats
> (supply at 0:20, shrine beacon at 0:45). Verified live: 60–61 fps with 300
> enemies + 120 crates + arrows + a live surge; vendor→pickup→LOGIC BOMB
> chain end-to-end; zero console errors. Deferred to post-launch liveops:
> shrine satellites (1.95.5), BLACKOUT (1.95.6c), VENDOR GLITCH (1.95.6d),
> billboard hacks (1.95.8), watchtower turret (1.95.9). Design note learned
> in verification: tall beacon columns wall off a top-down camera — beacons
> are now short additive pillars + ground discs, and the maglev runs at
> 150 u/s so the spectacle is actually watchable.

---

## 1. The honest diagnosis

Numbers from the shipped build:

| Fact                 | Value                       | Consequence                                                                   |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Map size             | 800 × 800 units             | —                                                                             |
| Visible screen       | ~60–90 units wide           | Player sees **<1%** of the map at any moment                                  |
| Base move speed      | 5.5 u/s                     | Crossing the map = **145 s**; spawn → Aegis Shrine = **~70 s** of pure travel |
| Run length           | 10 min                      | A shrine round-trip costs ~25% of the run                                     |
| Wayfinding           | none                        | Shrines/stash/statue are invisible until stumbled upon                        |
| Interactive props    | 3 shrines, 1 stash, 1 vault | ~5 touchpoints on 640,000 sq units                                            |
| Building interaction | zero                        | Obstacles are collision boxes with textures                                   |

The Phase 1.9 content is real but **spatially bankrupt**: it's distributed
across a map the player cannot afford to explore, with no signposting that it
exists. A casual player orbits their spawn point, sees asphalt and viruses,
and never learns the map has shrines at all. In level-design terms we built
**dead content** — the most expensive kind.

## 2. What the winners actually do (research)

**Survivor.io** — the highest-grossing hybrid-casual survivors game
([$500M+ lifetime IAP, still $5–6M/month three years post-launch](https://wnhub.io/news/finance/item-43301),
[Gamesforum analysis](https://www.gf.symphonyonline.co.uk/news/how-survivor.io-continues-to-pull-in-5-million-a-month-three-years-later)):

- **Content parachutes to the player.** Supply crates drop _near you_ with
  arrow indicators. You never travel to content; it arrives on a schedule.
- **One-hand simplicity is the product.** "Clear the map with one-hand
  controls" is the literal store pitch. Nothing requires navigation skill.
- **Liveops events drive login + revenue spikes**
  ([Sensor Tower: Thanksgiving event revenue surge](https://app.sensortower.com/news-feed/survivorio-new-thanksgiving-event-fuels-major-revenue-surge/6564000b223b924b05393b62)).
  The in-run event _cadence_ is the retention engine.

**Vampire Survivors** — the genre template
([design analysis](https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors),
[stage/arrow reference](https://rogueranker.com/vampire-survivors-stages/)):

- **Every off-screen item gets a HUD directional arrow** with the item's icon.
  The player always knows something desirable is 15 seconds away in _that_
  direction. Purposeful movement is manufactured, never assumed.
- **"Something good every few seconds."** XP on every kill, level-up choices,
  chest ceremonies, floor pickups (roast chicken, vacuum, rosary). The
  magnet-vacuum moment — a thousand gems streaking in from off-screen — is
  the single most cited dopamine hit in the genre.
- **Floor consumables are load-bearing**: heal, screen-nuke, vacuum spawn
  from destructible braziers/candles scattered _everywhere_. Destruction →
  reward is the idle verb between fights.

**Brotato / 20 Minutes Till Dawn** — the small-arena counter-proof
([Brotato-style genre tag](https://survivorslikes.com/genre-tags/brotato-style/),
[20MTD review](https://waytoomany.games/2023/12/30/review-20-minutes-till-dawn-switch/)):

- Deliberately **tiny arenas with "no incentive to wander far."** Zero dead
  content because there is nowhere content can hide. 20–60 s pressure cycles.
- The lesson isn't "shrink our map" — it's that **effective play space and
  content space must be the same size.**

### The synthesis

> A survivors-like map is not a world to explore. It is a **stage that
> performs for a player who is too busy to explore.** Distribute the
> _performance_, not the props.

## 3. The ideology — five pillars

Every future map decision (this phase and Maps 2+) is tested against these:

**P1 — THE MAP COMES TO YOU.** Anything the player must touch spawns within
one screen of them, or announces itself and waits. Fixed geography is for
_orientation_ (landmarks, districts), never for _content gating_.

**P2 — NOTHING EXISTS WITHOUT A SIGNPOST.** If it can be touched, it has a
HUD edge-arrow when off-screen and a minimap icon always. An unmarked
interactive is a bug, not a secret.

**P3 — SOMETHING GOOD EVERY TEN SECONDS.** Between combat beats there must
be an ambient reward verb: smash a prop, grab a pickup, clip a shrine.
Walking with nothing to click is a design failure with a stopwatch.

**P4 — THE MAP BREATHES ON A CLOCK.** A scheduled, announced event every
~75–90 s reshapes the fight (hazard, jackpot zone, delivery). This is the
liveops cadence _inside_ the run — the Survivor.io lesson.

**P5 — GEOGRAPHY IS FLAVOR + TACTICS, NOT HOMEWORK.** Districts exist so
fights feel different (open street vs. scrap maze) and screenshots look
different. The casual player who never leaves the courtyard must still
experience 100% of the systems.

## 4. The plan — work items

### Tier 1 — the non-negotiables (fix the diagnosis directly)

| #      | Item                                                | Detail                                                                                                                                                                                                                                                                                                                                                | Effort |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.95.1 | **POI wayfinding layer**                            | HUD screen-edge arrows (DOM overlay, not WebGL) pointing to every active POI within 120 u: ready shrines, stash, vault, chests, supply drops, event sites — each with an icon + distance fade. Minimap icons for all POIs. This single item revives every piece of Phase 1.9 content.                                                                 | M      |
| 1.95.2 | **Destructible props layer**                        | ~120 instanced small props (crates, barrels, neon sign stumps, hydrants) scattered so 3–5 are always on screen. One shot destroys → credits/XP scraps, 8% a floor pickup. Slow respawn off-screen. Same InstancedMesh pattern as enemies (2 draw calls: solid + glow). **This is P3 — the between-fights verb.**                                      | L      |
| 1.95.3 | **Floor consumables** (genre staple we're missing)  | Three pickups from destructibles/events, VS-proven: **MEDKIT** (heal 30), **MAGNA-PULSE** (vacuum all XP on map — _the_ dopamine moment), **LOGIC BOMB** (screen-wipe damage + stun). Instanced billboards, arrow-marked.                                                                                                                             | M      |
| 1.95.4 | **Supply drops** (Survivor.io's signature, adapted) | Every ~75 s: "SUPPLY INBOUND" → beacon + arrow → crate slams down **within 25 u of the player** with a ground-ring telegraph → opens as a chest or consumable. In co-op, drops target the party centroid.                                                                                                                                             | M      |
| 1.95.5 | **Shrine rebalance for reachability**               | Shrines stop being remote pilgrimage sites: on activation of any _map event_ (see 1.95.6), the nearest shrine also lights a **temporary satellite beacon** within a screen of the player granting a 8 s mini-version of its buff. The fixed shrines stay as the "full" version for players who route to them — depth for experts, access for casuals. | M      |

### Tier 2 — the map performs (P4)

| #       | Item                    | Detail                                                                                                                                                                                                                                                                                                 | Effort        |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 1.95.6  | **Map event scheduler** | One announced event every ~90 s, rotating (never the same twice in a row). All arrow-marked.                                                                                                                                                                                                           | M (framework) |
| 1.95.6a | **MAGLEV RUN**          | The dead rail line telegraphs (rails glow, warning klaxon, 3 s) then a light-wall train barrels across the map on it — kills every enemy in its path (spectacle + free crowd-clear if you bait the horde onto the tracks; heavy damage if _you_ stand on them). The rail line finally means something. | M             |
| 1.95.6b | **NEON SURGE**          | One district's signage supercharges for 25 s: double XP gems inside it + a visible sky-glow column. Pulls players _toward_ districts with a reward, not homework.                                                                                                                                      | S             |
| 1.95.6c | **BLACKOUT**            | Map lights dim to 40%, an elite pack spawns with a **jackpot chest** on a 20 s timer beside it. Risk/reward spike; bloom makes the dark gorgeous.                                                                                                                                                      | M             |
| 1.95.6d | **VENDOR GLITCH**       | All vending machines (see 1.95.7) spark and eject free consumables for 10 s. Teaches the vending interaction by making it fire once, loudly.                                                                                                                                                           | S             |

### Tier 3 — buildings you can actually use (the user's critique, directly)

| #       | Item                                      | Detail                                                                                                                                                                                                                                     | Effort |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1.95.7  | **Vending machines become slot machines** | The 4 existing vending props become interactives: walk up, spend 15 credits → roll a consumable (60%), credit jackpot (25%), a _shock_ (15% — zap nearby enemies). Arrow-marked when ready, 45 s restock. Buildings now have a _verb_.     | M      |
| 1.95.8  | **Billboard hack terminals**              | The 2 holo-billboard towers get a base terminal: stand in the ring 2 s (channel bar) → billboard flips to your character's face + **MAGNA-PULSE effect** + minimap reveals all POIs for 30 s. One use per billboard per 2 min.             | M      |
| 1.95.9  | **Watchtower uplink**                     | The Industrial Gate watchtower: channel 3 s at its base → an allied auto-turret fires from the tower top for 30 s (drone visual, uses existing projectile pool). The gate district becomes worth holding.                                  | M/L    |
| 1.95.10 | **Stash goes mobile**                     | The Black-Market smuggler stops hiding: his stash now spawns **within 40 u of the player**, arrow-marked, but _walks away_ (despawns after 25 s) — urgency instead of geography. Exclusive-item delivery casuals will actually experience. | S      |

### Tier 4 — the first 60 seconds (scripted, casual-first)

| #       | Item                     | Detail                                                                                                                                                                                                                                                                                                            | Effort |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.95.11 | **Opening choreography** | 0:00 spawn faces the statue (orientation); 0:05 three destructibles glint within one screen (teach the verb); 0:20 first supply drop lands on-screen; 0:45 nearest shrine fires its beacon column + arrow ("go touch one thing"); 1:00 normal cadence begins. A casual's first minute contains every system once. | M      |

### The casual-experience contract (acceptance criteria)

A test run played by _never leaving the courtyard_ must deliver:

- ≥ 1 interactive touched in the first 60 s without seeking (choreography)
- ≥ 3 POIs touched in the first 3 minutes (drops + satellites + vendors come to you)
- No 10-second window without an available reward verb on screen (destructibles)
- Every off-screen active POI has an arrow (zero unmarked content)
- All five pillars hold with **zero fps regression** at the 60-cap horde test

### Performance rules (unchanged discipline)

- Destructibles + consumables: instanced, budgeted through `scaleParticleCount()`, glow via the existing additive-layer pattern
- Arrows: DOM overlay updated at 10 Hz, not per-frame; hidden at MENU
- Events: reuse the ring/FX/announce primitives; one event live at a time
- Train: one mesh + one light-wall collider sweep, precomputed path
- Target: 60-cap parity at ~300 enemies, measured before each ship (as every phase)

### Monetization hooks planted (harvested in Phase 5)

- Supply drop → natural **rewarded-ad "double the drop"** slot
- Vending machine → soft-currency sink that tutorializes IAP currency value
- Blackout jackpot → the tension moment for a **revive ad** placement
- Event cadence → the skeleton for future limited-time liveops events
  (the Survivor.io revenue lesson)

### Build order

1. **1.95.1 wayfinding** (revives existing content instantly — biggest ROI line in this doc)
2. **1.95.2 + 1.95.3** destructibles + consumables (the ambient loop)
3. **1.95.4 supply drops + 1.95.6 scheduler** with MAGLEV RUN + NEON SURGE first
4. **1.95.7 vending + 1.95.10 mobile stash** (buildings gain verbs)
5. **1.95.11 opening choreography**, then BLACKOUT / VENDOR GLITCH / billboards / watchtower
6. Contract test + fps parity → ship

### Sources

- [Gamesforum — How Survivor.io continues to pull in $5M a month three years later](https://www.gf.symphonyonline.co.uk/news/how-survivor.io-continues-to-pull-in-5-million-a-month-three-years-later)
- [WN Hub — Survivor.io IAP revenue exceeds half a billion dollars](https://wnhub.io/news/finance/item-43301)
- [Sensor Tower — Survivor.io event-driven revenue surge](https://app.sensortower.com/news-feed/survivorio-new-thanksgiving-event-fuels-major-revenue-surge/6564000b223b924b05393b62)
- [KokuTech — Vampire Survivors design analysis: power fantasy & reward cadence](https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors)
- [Rogue Ranker — Vampire Survivors stages & HUD guide arrows](https://rogueranker.com/vampire-survivors-stages/)
- [Survivors-likes genre catalog — Brotato-style small arenas](https://survivorslikes.com/genre-tags/brotato-style/)
- [WayTooManyGames — 20 Minutes Till Dawn review (arena scale)](https://waytoomany.games/2023/12/30/review-20-minutes-till-dawn-switch/)
