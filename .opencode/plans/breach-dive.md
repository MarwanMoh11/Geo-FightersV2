# breach-dive — hacking becomes an actual cyberspace dive

Standalone plan. Natural run order is enemy-uplift → gapfixer → build-depth →
**breach-dive**, but this plan does **not** hard-depend on the others. It ships
with the existing reward loot on its own; rootkit rewards are additive only if the
build-depth EXPLOIT system exists.

## Background (verified in code)

Today a hack is a fun minigame overlay (`src/ui/BreachOverlay.svelte` →
`resolveBreach()` in `src/systems/BreachSystem.ts`) with a bland instant payoff
(`grantReward` ~497) and trivial punishment (fail = 20s node cooldown + at most
one WARDEN; abort = 5s — constants ~71-74). Playtesters expected to be
*transported somewhere* and were underwhelmed by an overlay on the same arena.

Design (decisions locked with owner):
- Minigame stays as the **lock**; on win you **enter a cyberspace dive** — a
  distinct sub-scene **themed per building kind** (6 verbs: bank=extraction,
  substation=hold-&-overload, armory=grab-&-run, relay=evasion, depot=supply run,
  stashden=gamble), with its own ICE constructs (not the field horde).
- **Outer world freezes** during the dive; a **trace meter climbs** — exit ambush
  size scales with time taken.
- **Win** → gear in hand + building flips to permanent **BREACHED** (node state +
  visual scar); **Fail/bail** → ejected into a trace-scaled closing-ring horde
  (reuse `spawnSwarm`), building stays sealed.
- **Two reward tiers**: scaled loot always (existing `grantReward` vocabulary),
  plus a **ROOTKIT** on high-security dives *if the exploit system is present*.
- **Solo-first**; co-op stays gated.

## Files to touch (verified; NEW marked)

| Path | Change |
|---|---|
| `src/systems/BreachDiveSystem.ts` | **NEW** — the dive loop: manage the themed sub-scene, ICE constructs, per-building objective/verb state machine, trace meter, win/fail detection. |
| `src/core/DiveScenes.ts` | **NEW** — 6 per-building themed cyberspace scene builders + teardown, modelled on `LevelSystem.initLevel` (build/dispose discipline). |
| `src/systems/BreachSystem.ts` | On minigame win, **enter dive** instead of instant `grantReward`; add permanent `opened`/`breached` node state; resolve exit (win=gear+opened, fail=ambush+sealed). `grantReward` becomes the exit-reward (scaled loot + rootkit-on-high-security, additive). |
| `src/main.ts` | Add a **`dive` game context**: swap the active scene to the dive scene, run `BreachDiveSystem` instead of the arena systems, freeze the outer world, restore on exit (scene created ~113; loop gating ~306/346). |
| `src/systems/LevelSystem.ts` | Reference `initLevel(scene)` (~181); export scene build/teardown helpers if needed for clean dive setup/dispose. |
| `src/systems/TimelineSpawner.ts` | Reuse `spawnSwarm` (ring/line) for the trace-scaled exit ambush. |
| `src/core/UIState.svelte.ts` | Add dive + trace-meter state (breach fields ~171-193). |
| `src/ui/BreachOverlay.svelte` (or NEW `src/ui/DiveHUD.svelte`) | Trace-meter + objective HUD during the dive. |
| ICE enemies | Reuse `spawnEnemy`/`EnemyType`; bespoke ICE constructs can reuse the enemy-uplift ability patterns if present, else simpler behaviours. |

## Ordered steps (grouped by agent)

**Chunk 1 — @explore**
1. Verify the scene lifecycle end-to-end: how `initRenderer`/`scene`/`renderFrame`
   and the loop's `shouldRunGame` interact so a dive scene can swap in cleanly and
   restore; confirm how `nodes` persist state across a run; confirm the
   `spawnSwarm` signature for the ambush.

**Chunk 2 — @build** (the scene-transition spine — the architectural heart)
2. Add the `dive` game state to `main.ts`: active-scene swap + outer-world freeze +
   restore. Create `BreachDiveSystem` skeleton and `DiveScenes.ts` with one
   generic theme. Wire `startBreach`-win → enter dive → exit → `resolveBreach`.
   Add permanent node `opened` state + trace-meter `uiState`.

**Chunk 3 — @algo** (dive mechanics)
3. Implement the per-building objective/verb state machines (extraction timer,
   hold-&-charge, evasion, gamble), the trace-meter → ambush-size scaling,
   win/fail detection, and ICE construct behaviours.

**Chunk 4 — @grunt** (exit-reward wiring)
4. Wire the exit rewards: scaled-loot tiers per building (existing vocabulary) +
   rootkit-on-high-security (additive if `ExploitRegistry` exists), permanent
   BREACHED bookkeeping, announces.

**Chunk 5 — @visual** (themes + FX + verify)
5. Author the 6 themed cyberspace scenes in `DiveScenes.ts`, ICE construct visuals,
   trace-meter/objective HUD, the BREACHED building scar, enter/exit transition FX.
   Live-verify each building's dive in the browser.

**Chunk 6 — @build** (integration + gate)
6. Integration, solo-gating (co-op parked), `npx tsc --noEmit`, and full-loop
   verification: enter → objective → win/fail → exit → correct arena state.

## Acceptance criteria (self-checkable)
- `npx tsc --noEmit` exits 0.
- Hacking a building: minigame → transported into a themed cyberspace scene
  (visibly distinct from the arena) → objective → exit.
- Outer world is visibly frozen during the dive; the trace meter climbs.
- **Win**: gear granted, building shows a permanent BREACHED state and can't be
  re-hacked (or at reduced value), player returned to the arena intact.
- **Fail/bail**: player ejected into a horde ambush whose size tracks trace/time;
  building stays sealed.
- Each of the 6 building kinds has a visually distinct dive theme + its own verb.
- Solo plays end-to-end; co-op stays gated with no regression.
- If the exploit system is present, a high-security dive grants a rootkit;
  otherwise scaled loot only — no crash, no hard dependency.

## Uncertainties (flagged)
- **Biggest scope + biggest risk = the scene transition** (single-scene/single-loop
  engine → two contexts). Prototype the swap+restore first to de-risk before
  committing to all six themes.
- **Soft-couples to build-depth**: rootkit rewards only meaningful if
  `ExploitRegistry` exists; the dive still ships with scaled loot alone.
- **ICE constructs** ideally reuse the enemy-uplift ability patterns; if the uplift
  isn't merged, ICE ships as simpler bespoke behaviours.
- **MP**: dive is solo-first; a joiner's behaviour during a host dive is out of
  scope (co-op parked).
- Per-building verbs + theme art are design-directed, not final; balance is live.
- **Perf/memory**: dive scene build/teardown must dispose geometries/materials on
  exit (reuse `LevelSystem` teardown discipline) — no leaks across repeated dives.

## Delegation note
Justified: spans the scene-transition architecture (build), dive/ICE state-machine
logic (algo), reward data wiring (grunt), and six themed scenes + FX (visual). The
two @build chunks bookend deliberately (spine first, integration last) — the
architecture demands it. No step tagged @hard.
