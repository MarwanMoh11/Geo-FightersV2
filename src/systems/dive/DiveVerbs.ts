// --- DIVE VERBS ---
// One objective state machine per building kind. Each verb owns its markers,
// writes its own HUD strings, and returns 'win' | 'fail' | null per frame.
//
// ONE CLOCK. Verbs no longer carry a private countdown that races the trace
// meter. Trace IS the clock: `traceRate = TRACE_MAX / budget(kind, security)`,
// so the trace bar reads as "percent of your time spent" and a verb is
// solvable exactly when it fits inside its budget. The old model ran a
// per-verb timer AND a trace meter with independently-tuned rates, and the
// trace almost always won: at security 3 every verb capped trace before its
// objective could physically be completed (bank needed 10s of channel inside
// a 10.5s trace window; depot needed 11 pickups in 12.5s). The dive was
// unwinnable at difficulty, which also made the rootkit gate in BreachSystem
// (security >= 3 AND trace <= 35%) mathematically unreachable — the exploits
// the dive exists to hand out could never drop.
//
// Trace is spent, not just accrued: killing ICE and completing objective
// steps SCRUB it back (see `scrub`), floored so the clock can be stretched at
// most ~2x. That makes fighting worth doing instead of a pure distraction,
// and gives the skill ceiling somewhere to go.

import * as THREE from 'three';
import type { BreachKind } from '../BreachSystem';
import { ARENA_R } from '../../core/DiveScenes';
import {
  createMarker,
  insideMarker,
  markerDistSq,
  popMarker,
  revealMarker,
  type DiveMarker,
} from './DiveMarkers';

export const TRACE_MAX = 100;

/**
 * Playable radius of the dive arena. Re-exported from DiveScenes so the
 * movement clamp and the drawn containment rim can never drift apart.
 */
export const DIVE_ARENA_R = ARENA_R;
/** Radius the main objective ring sits on. */
const OBJ_R = 13;
/** Radius of exit / cash-out pads — a real run from the objective ring. */
const EXIT_R = 17.5;

/**
 * Nominal seconds of clock per verb at security 0. Trace fills over exactly
 * this long. Numbers are the measured completion time (travel + channels) with
 * roughly 45% headroom for fighting through ICE.
 */
const BUDGET: Record<BreachKind, number> = {
  bank: 46,
  substation: 54,
  armory: 46,
  relay: 40,
  depot: 48,
  stashden: 44,
};

/** Each security level shortens the clock by this fraction. s=3 → 64% budget. */
const SECURITY_SQUEEZE = 0.12;
/** Overclock trades a shorter clock for the better payout. */
const OVERCLOCK_SQUEEZE = 0.15;

/**
 * Base trace points per second for a dive. The verb may add a multiplier on
 * top (the stash den's stack heat).
 */
export function baseTraceRate(kind: BreachKind, security: number, overclock: boolean): number {
  const budget =
    (BUDGET[kind] ?? 45) *
    (1 - SECURITY_SQUEEZE * security) *
    (overclock ? 1 - OVERCLOCK_SQUEEZE : 1);
  return TRACE_MAX / Math.max(8, budget);
}

export type DiveResult = 'win' | 'fail' | null;

export interface DiveCtx {
  scene: THREE.Scene;
  kind: BreachKind;
  security: number;
  overclock: boolean;
  /** Theme accent used to tint markers. */
  accent: number;
  /** Seconds since the dive started. */
  elapsed: number;
  /** Player position this frame. */
  px: number;
  pz: number;
  /** Live ICE within `r` of a point. */
  iceNear(x: number, z: number, r: number): number;
  /** Spawn `n` ICE on a ring around the arena centre. */
  spawnICE(n: number, minR?: number, maxR?: number): void;
  /** Spawn `n` ICE ringing a specific point — used to defend an objective. */
  spawnICEAt(n: number, x: number, z: number, radius: number): void;
  /** Push the trace meter back. Floored by the orchestrator. */
  scrub(points: number): void;
  /** Push the trace meter forward (a bust). */
  spike(points: number): void;
  /** Centre-screen dive banner. */
  banner(text: string): void;
  sfx(name: 'pickup' | 'step' | 'alarm' | 'bust' | 'reveal'): void;
}

export interface DiveVerb {
  readonly markers: DiveMarker[];
  /** Extra multiplier on the trace rate (stash den stack heat). */
  traceMult: number;
  /** 0..1 payout bonus folded into the win quality. */
  bonus: number;
  stage: string;
  text: string;
  note: string;
  progress: number;
  progressMax: number;
  tick(ctx: DiveCtx, dt: number): DiveResult;
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Spread `n` points around a ring with enough jitter to vary runs.
 *
 * `even` matters for route length: golden-angle placement scatters nicely for
 * a sweep (armory crates) but makes a *sequence* of stops leapfrog across the
 * arena — at security 3 the substation's six pads golden-spread into a route
 * ~90 units long, which alone overran the whole trace budget. Ordered-visit
 * verbs pass `even` so adjacent stops really are adjacent.
 */
function ringSpread(
  n: number,
  minR: number,
  maxR: number,
  even = false,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const phase = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const step = even ? (Math.PI * 2) / n : GOLDEN;
    const a = phase + i * step + (Math.random() - 0.5) * 0.3;
    const r = minR + ((i * 0.618) % 1) * (maxR - minR);
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return out;
}

/** Pick the marker furthest from the player — keeps every leg a real run. */
function furthestFrom(markers: DiveMarker[], px: number, pz: number): DiveMarker | null {
  let best: DiveMarker | null = null;
  let bestD = -1;
  for (const m of markers) {
    const d = markerDistSq(m, px, pz);
    if (d > bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// BANK — EXTRACTION: hold a contested point until the download completes
// ---------------------------------------------------------------------------

const EXTRACT_SECONDS = 10; // clean seconds of hold needed
const CONTEST_R = 4.2; // ICE this close to the pad stall the download
/** Rollback while contested. Kept below the fill rate so a 50/50 fight still
 *  nets forward progress — otherwise a security-3 pack stalemates the pad. */
const CONTEST_ROLLBACK = 6;

function makeExtraction(ctx: DiveCtx): DiveVerb {
  const pad = createMarker(ctx.scene, {
    x: 0,
    z: 0,
    radius: 3.4,
    shape: 'zone',
    color: ctx.accent,
    label: 'DATA CORE',
  });

  return {
    markers: [pad],
    traceMult: 1,
    bonus: 0,
    stage: 'REACH THE DATA CORE',
    text: 'Stand on the core to start the download',
    note: '',
    progress: 0,
    progressMax: 100,

    tick(c, dt) {
      const on = insideMarker(pad, c.px, c.pz);
      const contested = c.iceNear(pad.x, pad.z, CONTEST_R) > 0;

      if (on && !contested) {
        this.progress = Math.min(100, this.progress + (100 / EXTRACT_SECONDS) * dt);
        pad.state = 'active';
        this.stage = 'DOWNLOADING';
        this.text = 'Hold the core — keep ICE off the pad';
      } else if (on) {
        // Contested: the download doesn't just pause, it rolls back. Clearing
        // the pad is the verb, not standing on it.
        this.progress = Math.max(0, this.progress - CONTEST_ROLLBACK * dt);
        pad.state = 'contested';
        this.stage = 'CONTESTED';
        this.text = 'ICE on the pad — clear them out';
      } else {
        this.progress = Math.max(0, this.progress - 4 * dt);
        pad.state = 'idle';
        this.stage = 'REACH THE DATA CORE';
        this.text = 'Stand on the core to resume the download';
      }

      pad.fill = this.progress / 100;
      this.note = contested ? `${c.iceNear(pad.x, pad.z, CONTEST_R)} ICE ON PAD` : '';
      return this.progress >= 100 ? 'win' : null;
    },
  };
}

// ---------------------------------------------------------------------------
// SUBSTATION — OVERLOAD: charge the outer pads, then hold the capacitor
// ---------------------------------------------------------------------------

const PAD_CHANNEL = 1.2; // seconds standing on a pad to charge it
const CAPACITOR_SECONDS = 8;

function makeOverload(ctx: DiveCtx): DiveVerb {
  const padCount = 3 + ctx.security;
  const spots = ringSpread(padCount, OBJ_R - 2, OBJ_R + 2, true);
  const pads = spots.map((p, i) =>
    createMarker(ctx.scene, {
      x: p.x,
      z: p.z,
      radius: 1.9,
      shape: 'pad',
      color: ctx.accent,
      label: `PAD ${i + 1}`,
    }),
  );
  const capacitor = createMarker(ctx.scene, {
    x: 0,
    z: 0,
    radius: 3.0,
    shape: 'zone',
    color: 0x3dff9a,
    label: 'CAPACITOR',
    hidden: true,
  });

  let charged = 0;
  let phase2 = false;
  let cap = 0;

  return {
    markers: [...pads, capacitor],
    traceMult: 1,
    bonus: 0,
    stage: 'CHARGE THE PADS',
    text: `Charge 0/${padCount} pads`,
    note: '',
    progress: 0,
    progressMax: padCount,

    tick(c, dt) {
      if (!phase2) {
        for (const pad of pads) {
          if (pad.state === 'done') continue;
          if (insideMarker(pad, c.px, c.pz)) {
            pad.state = 'active';
            pad.fill = Math.min(1, pad.fill + dt / PAD_CHANNEL);
            if (pad.fill >= 1) {
              pad.state = 'done';
              charged++;
              c.scrub(5);
              c.sfx('step');
              c.banner(`PAD CHARGED ${charged}/${padCount}`);
            }
          } else if (pad.fill > 0) {
            // Partial charge decays — you have to commit to a pad.
            pad.fill = Math.max(0, pad.fill - dt * 0.5);
            pad.state = 'idle';
          }
        }

        this.progress = charged;
        this.progressMax = padCount;
        this.stage = 'CHARGE THE PADS';
        this.text = `Charge ${charged}/${padCount} pads`;

        if (charged >= padCount) {
          phase2 = true;
          revealMarker(capacitor);
          capacitor.state = 'active';
          c.sfx('reveal');
          c.banner('CAPACITOR ARMED — RETURN TO CENTRE');
          // The grid notices. Ring the capacitor so the payoff is defended.
          c.spawnICEAt(3 + ctx.security, 0, 0, 9);
        }
        return null;
      }

      // Phase 2 — hold the capacitor. No drain: this is the payoff leg, the
      // only pressure is the clock and the ICE ring.
      const on = insideMarker(capacitor, c.px, c.pz);
      if (on) cap = Math.min(100, cap + (100 / CAPACITOR_SECONDS) * dt);
      capacitor.fill = cap / 100;
      capacitor.state = on ? 'active' : 'idle';

      this.progress = cap;
      this.progressMax = 100;
      this.stage = on ? 'OVERLOADING' : 'RETURN TO THE CAPACITOR';
      this.text = on ? `Overload ${Math.floor(cap)}%` : 'Stand in the capacitor to overload';
      return cap >= 100 ? 'win' : null;
    },
  };
}

// ---------------------------------------------------------------------------
// ARMORY — GRAB & RUN: sweep the crates, then fight to the exit
// ---------------------------------------------------------------------------

function makeGrabAndRun(ctx: DiveCtx): DiveVerb {
  const total = 4 + ctx.security;
  const spots = ringSpread(total, 7, OBJ_R + 2);
  const crates = spots.map((p, i) =>
    createMarker(ctx.scene, {
      x: p.x,
      z: p.z,
      radius: 1.5,
      shape: 'crate',
      color: ctx.accent,
      label: `CRATE ${i + 1}`,
    }),
  );
  const exitAngle = Math.random() * Math.PI * 2;
  const exit = createMarker(ctx.scene, {
    x: Math.cos(exitAngle) * EXIT_R,
    z: Math.sin(exitAngle) * EXIT_R,
    radius: 2.4,
    shape: 'exit',
    color: 0x3dff9a,
    label: 'EXIT',
    hidden: true,
  });

  let got = 0;
  let running = false;

  return {
    markers: [...crates, exit],
    traceMult: 1,
    bonus: 0,
    stage: 'STRIP THE ARSENAL',
    text: `Crates 0/${total}`,
    note: '',
    progress: 0,
    progressMax: total,

    tick(c, dt) {
      void dt;
      if (!running) {
        for (const crate of crates) {
          if (crate.collected || crate.popTimer > 0) continue;
          if (insideMarker(crate, c.px, c.pz)) {
            popMarker(crate);
            got++;
            c.scrub(4);
            c.sfx('pickup');
          }
        }
        this.progress = got;
        this.text = `Crates ${got}/${total}`;

        if (got >= total) {
          running = true;
          revealMarker(exit);
          exit.state = 'active';
          c.sfx('alarm');
          c.banner('ARSENAL STRIPPED — RUN FOR THE EXIT');
          // The exit is not a free walk: the alarm drops ICE between you and
          // the door, so the run leg has to be fought through.
          c.spawnICEAt(4 + ctx.security * 2, exit.x, exit.z, 8);
        }
        return null;
      }

      this.stage = 'GET TO THE EXIT';
      this.text = 'Reach the green pad';
      this.progress = total;
      exit.fill = 1 - Math.min(1, Math.sqrt(markerDistSq(exit, c.px, c.pz)) / 14);
      return insideMarker(exit, c.px, c.pz) ? 'win' : null;
    },
  };
}

// ---------------------------------------------------------------------------
// RELAY — UPLINK: lock three towers in sequence while the hunt closes
// ---------------------------------------------------------------------------

const TOWER_CHANNEL = 2.0;
const LOCKS_NEEDED = 3;

function makeUplink(ctx: DiveCtx): DiveVerb {
  // Fixed triangle so the towers line up with the relay scene's antenna
  // silhouettes — the landmark and the objective are the same object.
  const towers = [0, 1, 2].map((i) => {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    return createMarker(ctx.scene, {
      x: Math.cos(a) * OBJ_R,
      z: Math.sin(a) * OBJ_R,
      radius: 2.2,
      shape: 'pad',
      color: ctx.accent,
      label: `TOWER ${i + 1}`,
    });
  });

  let locks = 0;
  let active: DiveMarker = towers[0];
  active.state = 'active';

  return {
    markers: towers,
    traceMult: 1,
    bonus: 0,
    stage: 'SYNC THE UPLINK',
    text: `Uplink 0/${LOCKS_NEEDED}`,
    note: 'Hold the lit tower — ICE are hunting',
    progress: 0,
    progressMax: LOCKS_NEEDED,

    tick(c, dt) {
      if (insideMarker(active, c.px, c.pz)) {
        active.fill = Math.min(1, active.fill + dt / TOWER_CHANNEL);
        this.stage = 'SYNCING';
      } else {
        // Leaving mid-sync bleeds progress — the hunt has to be outrun, not
        // waited out.
        active.fill = Math.max(0, active.fill - dt * 0.6);
        this.stage = 'REACH THE LIT TOWER';
      }

      if (active.fill >= 1) {
        active.state = 'done';
        active.fill = 1;
        locks++;
        c.scrub(6);
        c.sfx('step');
        this.progress = locks;
        if (locks >= LOCKS_NEEDED) {
          this.text = 'Uplink synced';
          return 'win';
        }
        // Always hand the player the tower they are furthest from: every leg
        // is a real crossing with the pack on their back.
        const next = furthestFrom(
          towers.filter((t) => t !== active),
          c.px,
          c.pz,
        );
        if (next) {
          active = next;
          active.state = 'active';
          active.fill = 0;
          c.banner(`UPLINK ${locks}/${LOCKS_NEEDED} — NEXT TOWER`);
          c.spawnICEAt(2 + ctx.security, active.x, active.z, 10);
        }
      }

      this.text = `Uplink ${locks}/${LOCKS_NEEDED}`;
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// DEPOT — SUPPLY RUN: catch airdrops as they land
// ---------------------------------------------------------------------------

const DROP_TELEGRAPH = 1.3; // seconds between the marker appearing and landing
const DROP_TTL = 9; // seconds a landed crate survives before it is lost
const MAX_LIVE_DROPS = 2;

interface Drop {
  marker: DiveMarker;
  /** Counts up to DROP_TELEGRAPH, then the crate is live. */
  landing: number;
  ttl: number;
  done: boolean;
}

function makeSupplyRun(ctx: DiveCtx): DiveVerb {
  const needed = 4 + ctx.security;
  const drops: Drop[] = [];
  const markers: DiveMarker[] = [];
  let collected = 0;

  const liveDrops = () => {
    let n = 0;
    for (const d of drops) if (!d.done) n++;
    return n;
  };

  const addDrop = () => {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * (OBJ_R + 1 - 6);
    const marker = createMarker(ctx.scene, {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      radius: 1.6,
      shape: 'crate',
      color: ctx.accent,
      label: 'SUPPLY',
    });
    marker.state = 'idle';
    if (marker.body) marker.body.visible = false; // hidden until it lands
    drops.push({ marker, landing: 0, ttl: DROP_TTL, done: false });
    markers.push(marker);
  };

  /** Keep the sky full: never more than MAX_LIVE_DROPS, never fewer than needed. */
  const ensureDrops = () => {
    const want = Math.min(MAX_LIVE_DROPS, needed - collected);
    while (liveDrops() < want) addDrop();
  };

  ensureDrops();

  return {
    markers,
    traceMult: 1,
    bonus: 0,
    stage: 'CATCH THE DROPS',
    text: `Supplies 0/${needed}`,
    note: 'Crates land where the ring closes',
    progress: 0,
    progressMax: needed,

    tick(c, dt) {
      for (const d of drops) {
        if (d.done) continue;

        if (d.landing < DROP_TELEGRAPH) {
          // Telegraph: the ring closes in, then the crate drops into it.
          d.landing += dt;
          d.marker.fill = d.landing / DROP_TELEGRAPH;
          d.marker.state = 'idle';
          if (d.landing >= DROP_TELEGRAPH) {
            d.marker.fill = 0;
            d.marker.state = 'active';
            if (d.marker.body) d.marker.body.visible = true;
            c.sfx('reveal');
          }
          continue;
        }

        if (insideMarker(d.marker, c.px, c.pz)) {
          popMarker(d.marker);
          d.done = true;
          collected++;
          c.scrub(4);
          c.sfx('pickup');
          continue;
        }

        d.ttl -= dt;
        if (d.ttl <= 0) {
          // Lost drops are replaced, never soft-locked — but the wasted trip
          // is the punishment.
          popMarker(d.marker);
          d.done = true;
          c.banner('SUPPLY LOST');
        }
      }

      this.progress = collected;
      this.text = `Supplies ${collected}/${needed}`;
      if (collected >= needed) return 'win';

      ensureDrops();
      this.stage = 'CATCH THE DROPS';
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// STASH DEN — GAMBLE: push the stack at the altar, bank it at the pad
// ---------------------------------------------------------------------------

const PUSH_CHANNEL = 1.5; // seconds of hold per push
const BUST_BASE = 0.08;
const BUST_STEP = 0.09;
const BUST_CAP = 0.7;
/** Trace rate added per stack — pushing costs clock as well as risk. */
const STACK_HEAT = 0.22;

function makeGamble(ctx: DiveCtx): DiveVerb {
  const altar = createMarker(ctx.scene, {
    x: 0,
    z: 0,
    radius: 2.6,
    shape: 'altar',
    color: ctx.accent,
    label: 'ALTAR',
  });
  const cashAngle = Math.random() * Math.PI * 2;
  const cashOut = createMarker(ctx.scene, {
    x: Math.cos(cashAngle) * EXIT_R,
    z: Math.sin(cashAngle) * EXIT_R,
    radius: 2.4,
    shape: 'exit',
    color: 0x3dff9a,
    label: 'CASH OUT',
    hidden: true,
  });

  let stack = 0;
  let revealed = false;
  const bustChance = () => Math.min(BUST_CAP, BUST_BASE + stack * BUST_STEP);

  return {
    markers: [altar, cashOut],
    traceMult: 1,
    bonus: 0,
    stage: 'PUSH AT THE ALTAR',
    text: 'Hold the altar to raise the stack',
    note: `NEXT PUSH — ${Math.round(BUST_BASE * 100)}% BUST`,
    progress: 0,
    progressMax: 8,

    tick(c, dt) {
      if (insideMarker(altar, c.px, c.pz)) {
        altar.state = 'active';
        altar.fill = Math.min(1, altar.fill + dt / PUSH_CHANNEL);
        this.stage = 'PUSHING';
        if (altar.fill >= 1) {
          altar.fill = 0;
          if (Math.random() < bustChance()) {
            // A bust wipes the stack instead of ending the dive. The old verb
            // rolled silently on proximity and instant-failed you out of the
            // building — no choice, no read, no recovery.
            stack = 0;
            revealed = false;
            cashOut.hidden = true;
            cashOut.group.visible = false;
            this.traceMult = 1;
            c.spike(18);
            c.sfx('bust');
            c.banner('BUST — STACK WIPED');
            c.spawnICEAt(3 + ctx.security, 0, 0, 8);
          } else {
            stack++;
            this.traceMult = 1 + stack * STACK_HEAT;
            c.sfx('step');
            c.banner(`STACK ${stack}`);
            c.spawnICEAt(2 + ctx.security, 0, 0, 9);
            if (!revealed) {
              revealed = true;
              revealMarker(cashOut);
              cashOut.state = 'active';
            }
          }
        }
      } else {
        // Stepping off mid-push loses the channel — the push is a commitment.
        altar.fill = 0;
        altar.state = stack > 0 ? 'done' : 'idle';
        this.stage = stack > 0 ? `STACK ${stack} — BANK IT OR PUSH` : 'PUSH AT THE ALTAR';
      }

      this.progress = stack;
      this.bonus = Math.min(1, stack / 6);
      this.note = `NEXT PUSH — ${Math.round(bustChance() * 100)}% BUST`;
      this.text =
        stack > 0
          ? `Stack ${stack} — cash out at the green pad`
          : 'Hold the altar to raise the stack';

      if (stack > 0 && insideMarker(cashOut, c.px, c.pz)) return 'win';
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const VERBS: Record<BreachKind, (ctx: DiveCtx) => DiveVerb> = {
  bank: makeExtraction,
  substation: makeOverload,
  armory: makeGrabAndRun,
  relay: makeUplink,
  depot: makeSupplyRun,
  stashden: makeGamble,
};

/** Short verb name for the HUD header. */
export const VERB_NAME: Record<BreachKind, string> = {
  bank: 'EXTRACTION',
  substation: 'OVERLOAD',
  armory: 'GRAB & RUN',
  relay: 'UPLINK',
  depot: 'SUPPLY RUN',
  stashden: 'GAMBLE',
};

/** One-line briefing shown on the enter transition. */
export const VERB_BRIEF: Record<BreachKind, string> = {
  bank: 'HOLD THE DATA CORE UNTIL THE DOWNLOAD LANDS',
  substation: 'CHARGE EVERY PAD, THEN OVERLOAD THE CAPACITOR',
  armory: 'STRIP EVERY CRATE, THEN FIGHT TO THE EXIT',
  relay: 'LOCK ALL THREE TOWERS WHILE THE HUNT CLOSES',
  depot: 'CATCH THE AIRDROPS BEFORE THEY EXPIRE',
  stashden: 'PUSH THE STACK, THEN BANK IT BEFORE YOU BUST',
};

/**
 * Build the verb state machine for a breach kind. Markers are spawned into
 * `ctx.scene` immediately; the caller disposes them via `disposeMarkers`.
 */
export function createVerb(kind: BreachKind, ctx: DiveCtx): DiveVerb {
  return (VERBS[kind] ?? makeSupplyRun)(ctx);
}
