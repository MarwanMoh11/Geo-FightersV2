# Phase 1.96 — JACK IN: Enterable Buildings & Breach Running

**Status: SHIPPED (2026-07-10).** All six node kinds live with doors, holo-signs,
power-lines, the GridRunner overlay, security ramp, OVERCLOCK, ICE TRACER,
CYPHER/BYTE perks and the SKELETON KEY drop. Live-verified: depot breach full
loop (prompt → jack in → win → pickups + credit shower + LOGIC BOMB exit
moment) at 59-61 fps with the horde running underneath; maze engine responds
to keyboard (packet movement confirmed via DOM state). Two hardening fixes
landed during verification: level-ups rolled mid-breach are deferred to
jack-out, and jacking in is blocked while the world is frozen behind the
upgrade/pause modal (stale-prompt race). Co-op client-initiated breaches
remain Phase 2 work.

## The problem this phase kills

Phase 1.95 fixed _discovery_ (arrows, events, the map coming to you) but not
_affordance_: interactables still read as colored boxes. A beginner can't tell
a shrine from a wall, half the structures are visually anonymous, and "walk
into the invisible circle" is not a verb anyone recognizes. The fix is a single
universal interaction grammar: **glowing door = you can enter = stand in it to
JACK IN.** Everything touchable becomes an enterable node with a breach
mini-game behind it; everything that isn't touchable gets visually demoted so
contrast does the teaching.

## Research anchor

Dispatch (AdHoc Studio, 2025) proves a hacking mini-game works inside a
narrative/action loop when it's _also_ an action game: pilot a shape through a
circuit maze, tap short input sequences to bridge gaps, dodge red "antivirus"
chasers, race an orange timer — with unlimited-retry accessibility. Sources:
[Escapist hacking guide](https://www.escapistmagazine.com/dispatch-hacking-guide/),
[PC Gamer interview](https://www.pcgamer.com/games/adventure/we-are-definitely-not-doing-qtes-said-dispatchs-creative-director-before-doing-qtes-we-just-needed-it-to-not-suck/).
We port those exact verbs (move, bridge, dodge, race) because they're the
skills the player is already using in the arena.

## Design

### The jack-in loop

Touch a glowing door → JACK IN prompt (E; Q = OVERCLOCK; F = SKELETON KEY;
DOM buttons on mobile) → fighter locks in place under a **breach shield**
(solo: invulnerable; co-op host: shield drains per nearby enemy —
defend-the-hacker) → DOM overlay plays a 10–20 s GridRunner breach → win =
the building's exclusive reward, fail = 20 s lockout (+ ICE TRACER at Sec 3).
**The world keeps simulating.** Enemies pile up outside; the reward is the
tool for the exit wave. Level-ups rolled during a breach are deferred until
jack-out.

### One engine, themed per node ("GridRunner")

Procedural braided maze (13×9 tiles), tile-step movement (WASD/arrows/swipe),
orange timer bar. Modifiers by building:

| Node (structure)                   | Signature twist                | Reward (OVERCLOCK doubles it)             |
| ---------------------------------- | ------------------------------ | ----------------------------------------- |
| SUPPLY DEPOT ×4 (vending machines) | none — the tutorial breach     | consumable pickups + credits              |
| ARMORY (watchtower)                | input-sequence gate locks      | +1 level to a random owned weapon         |
| DATA BANK (new, Main Street)       | antivirus chaser (BFS pursuit) | rare/epic chest + credit shower           |
| RELAY TOWER ×3 (shrines)           | two switches in order          | shrine buff 30 s + all enemies slowed 8 s |
| SUBSTATION (new, Scrap Yards)      | brutal timer                   | EMP screen-clear on exit                  |
| STASH DEN (new, Courtyard)         | fog — see 2 tiles ahead        | SCAVENGER CHIP / epic chest               |

Security ramps with run time (Lv1 <2:30, Lv2 <5:30, Lv3 after; Lv3 adds a
chaser everywhere + tight timer). **First breach of every run is Security 0**
— near-unfailable; the tutorial is the loop. OVERCLOCK: timer ×0.65 +1 chaser,
2× reward. Fail at Sec 3 spawns an **ICE TRACER** (fast red Warden) hunting
the hacker. Hacking perks: CYPHER +25% breach timer; BYTE's first antivirus
contact freezes it instead of failing. **SKELETON KEY** (rare crate drop)
auto-completes any breach.

### Legibility (Part 0)

Every node gets: an additive **door quad** + ground light-spill in a category
color, a camera-facing **holo-sign sprite** (icon + name + security pips), and
a merged **power-line strip** running from the street to the door. Cooldown =
door/sign dim. Old walk-on shrine buffs and vending slot-pulls are replaced by
the door grammar (one rule everywhere); the roaming black-market stash stays
(it's a pickup, not a building). Non-interactive props darken slightly so glow
means touchable.

## Performance rules (unchanged law)

- The mini-game and prompt are pure DOM/Svelte — zero renderer cost.
- Node dressing is static geometry: 1 merged power-line mesh, ~10 small door
  quads/rings, ~10 sign sprites. No per-frame allocation; one 10-node distance
  check per frame.
- The world sim keeps running during a breach at full population. FPS parity
  with a full horde is the ship gate.

## Co-op scope

Host/solo can breach (matching every 1.95 system); the host breaching creates
the defend-the-hacker moment. Client-initiated breaches + reward sync are
Phase 2 work.
