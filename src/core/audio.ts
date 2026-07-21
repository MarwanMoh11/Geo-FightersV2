/**
 * GeoFighters audio engine — fully procedural (zero audio files).
 *
 * Signal flow:
 *
 *   music voices ─▶ (padPump/arpPump) ─▶ musicBus ─▶ duckFilter ─▶ musicGain ┐
 *   music sends ──▶ musicVerb / pingpong delay ──▶ musicBus                  ├▶ masterGain ─▶ compressor ─▶ out
 *   sfx voices ───▶ sfxBus ─────────────────────────────────────▶ sfxGain   ┘
 *   sfx sends ────▶ sfxVerb ─▶ sfxBus
 *
 * The soundtrack is a lookahead-scheduled synthwave loop (110 BPM, A minor,
 * Am–F–C–G) with a composed lead hook. `setMusicIntensity(0..1)` fades layers
 * in/out so the mix builds from an ambient menu bed to a full arrangement at
 * the boss. All SFX pass through per-sound rate gates and crowd attenuation so
 * a horde dying at once stays punchy instead of clipping into noise.
 */

// --- CONTEXT & BUSES ---
let ctx: AudioContext | null = null;

let masterGainNode: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

const MUSIC_BUS_GAIN = 1.6;

let musicGainNode: GainNode | null = null;
let musicBus: GainNode | null = null;
let ceremonyBus: GainNode | null = null;
let duckFilter: BiquadFilterNode | null = null;
let padPump: GainNode | null = null;
let arpPump: GainNode | null = null;
let musicVerbSend: GainNode | null = null;
let delaySend: GainNode | null = null;

let sfxGainNode: GainNode | null = null;
let sfxBus: GainNode | null = null;
let sfxVerbSend: GainNode | null = null;

// Volume multipliers (0-1)
let masterVolume = 0.8;
let musicVolume = 0.6;
let sfxVolume = 0.8;

/** Exponentially-decaying stereo noise — a cheap, pleasant reverb impulse. */
function makeImpulseResponse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Mastering chain: everything funnels through a gentle glue compressor so
    // stacked SFX get denser, not louder/clipped.
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    // Makeup gain: per-voice levels are conservative, the compressor tames
    // peaks, and this stage restores publication loudness.
    const makeup = ctx.createGain();
    makeup.gain.value = 1.5;
    compressor.connect(makeup);

    // Final soft-clip safety: y = tanh(1.2x)/1.2 — unity gain for normal
    // levels, smooth saturation on transient stacks the compressor's 4ms
    // attack lets through. Output physically cannot exceed ~0.83 FS.
    const softClip = ctx.createWaveShaper();
    const CURVE_LEN = 2048;
    const curve = new Float32Array(CURVE_LEN);
    for (let i = 0; i < CURVE_LEN; i++) {
      // WaveShaper maps input [-1, 1] across the curve array — the domain
      // must match or the shaper applies hidden gain.
      const x = (i / (CURVE_LEN - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.2 * x) / 1.2;
    }
    softClip.curve = curve;
    softClip.oversample = '2x';
    makeup.connect(softClip);
    softClip.connect(ctx.destination);

    masterGainNode = ctx.createGain();
    masterGainNode.gain.value = masterVolume;
    masterGainNode.connect(compressor);

    // --- Music side ---
    musicGainNode = ctx.createGain();
    musicGainNode.gain.value = musicVolume;
    musicGainNode.connect(masterGainNode);

    // Lowpass used to "duck" music underwater while paused.
    duckFilter = ctx.createBiquadFilter();
    duckFilter.type = 'lowpass';
    duckFilter.frequency.value = 18000;
    duckFilter.Q.value = 0.4;
    duckFilter.connect(musicGainNode);

    // Bus gains run hot on purpose — per-voice gains are conservative and the
    // mastering compressor catches the sum, so the game sits at a healthy
    // loudness instead of whisper-quiet.
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_BUS_GAIN;
    musicBus.connect(duckFilter);

    // Ceremony bus: the chest-fanfare's own channel. It bypasses musicBus so
    // the main soundtrack can be ducked underneath it, but still sits behind
    // the music volume setting.
    ceremonyBus = ctx.createGain();
    ceremonyBus.gain.value = 1.7;
    ceremonyBus.connect(musicGainNode);

    // Sidechain pump targets (kick dips these, base gain is always 1).
    padPump = ctx.createGain();
    padPump.connect(musicBus);
    arpPump = ctx.createGain();
    arpPump.connect(musicBus);

    // Music reverb (hall-ish tail for pads/lead).
    const musicVerb = ctx.createConvolver();
    musicVerb.buffer = makeImpulseResponse(ctx, 2.2, 3.5);
    const musicVerbReturn = ctx.createGain();
    musicVerbReturn.gain.value = 0.55;
    musicVerbSend = ctx.createGain();
    musicVerbSend.gain.value = 1;
    musicVerbSend.connect(musicVerb);
    musicVerb.connect(musicVerbReturn);
    musicVerbReturn.connect(musicBus);

    // Tempo-synced ping-pong delay (dotted eighth) for arp/lead.
    const dly = 60 / BPM / 4; // one sixteenth
    const delayL = ctx.createDelay(2);
    delayL.delayTime.value = dly * 3;
    const delayR = ctx.createDelay(2);
    delayR.delayTime.value = dly * 3;
    const fbL = ctx.createGain();
    fbL.gain.value = 0.3;
    const fbR = ctx.createGain();
    fbR.gain.value = 0.3;
    const dlyHp = ctx.createBiquadFilter();
    dlyHp.type = 'highpass';
    dlyHp.frequency.value = 500;
    const panL = ctx.createStereoPanner();
    panL.pan.value = -0.55;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 0.55;
    delaySend = ctx.createGain();
    delaySend.gain.value = 1;
    delaySend.connect(dlyHp);
    dlyHp.connect(delayL);
    delayL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(fbR);
    fbR.connect(delayL);
    const dlyOut = ctx.createGain();
    dlyOut.gain.value = 0.4;
    delayL.connect(panL);
    delayR.connect(panR);
    panL.connect(dlyOut);
    panR.connect(dlyOut);
    dlyOut.connect(musicBus);

    // --- SFX side ---
    sfxGainNode = ctx.createGain();
    sfxGainNode.gain.value = sfxVolume;
    sfxGainNode.connect(masterGainNode);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.5;
    sfxBus.connect(sfxGainNode);

    // Short "room" reverb — gives pickups/impacts a little space.
    const sfxVerb = ctx.createConvolver();
    sfxVerb.buffer = makeImpulseResponse(ctx, 0.9, 4.5);
    const sfxVerbReturn = ctx.createGain();
    sfxVerbReturn.gain.value = 0.5;
    sfxVerbSend = ctx.createGain();
    sfxVerbSend.gain.value = 1;
    sfxVerbSend.connect(sfxVerb);
    sfxVerb.connect(sfxVerbReturn);
    sfxVerbReturn.connect(sfxBus);
  }
  return ctx;
}

// --- VOLUME CONTROL ---
// While the tab is hidden (or a portal ad is playing) the master gain is held
// at 0; the user's chosen volume is kept in masterVolume and restored after.
let backgroundMuted = false;
// Portal-level mute (CrazyGames SDK settings.muteAudio). Required to take
// priority over every in-game audio control: while set, nothing may restore
// the master gain — not the settings slider, not a background unmute.
let portalMuted = false;

export function setPortalMute(muted: boolean): void {
  portalMuted = muted;
  if (masterGainNode && ctx) {
    masterGainNode.gain.setValueAtTime(
      muted || backgroundMuted ? 0 : masterVolume,
      ctx.currentTime,
    );
  }
}

export function setMasterGain(value: number): void {
  masterVolume = Math.max(0, Math.min(1, value));
  if (masterGainNode && !backgroundMuted && !portalMuted) {
    masterGainNode.gain.setValueAtTime(masterVolume, ctx?.currentTime || 0);
  }
}

export function muteForBackground(): void {
  backgroundMuted = true;
  if (masterGainNode && ctx) {
    masterGainNode.gain.setValueAtTime(0, ctx.currentTime);
  }
  // Fully suspend the context: a muted-but-running AudioContext keeps the OS
  // audio hardware thread alive, which costs real battery in the background.
  if (ctx && ctx.state === 'running') {
    void ctx.suspend();
  }
}

export function unmuteFromBackground(): void {
  backgroundMuted = false;
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
  if (masterGainNode && ctx && !portalMuted) {
    masterGainNode.gain.setValueAtTime(masterVolume, ctx.currentTime);
  }
}

export function setMusicGain(value: number): void {
  musicVolume = Math.max(0, Math.min(1, value));
  if (musicGainNode && ctx && !musicUserMuted) {
    musicGainNode.gain.setValueAtTime(musicVolume, ctx.currentTime);
  }
}

// Settings > "Music Enabled" toggle. Independent of the master-bus mutes
// above (background tab-hide, portal SDK mute) — this silences ONLY the
// music sub-bus, leaving SFX audible, by gating musicGainNode directly
// rather than touching the scheduler. The scheduler keeps running (cheap;
// it already runs whenever a run/menu is active regardless of this toggle)
// so there's no re-arm timing to get wrong — toggling back on just ramps
// the gain back up on whatever the scheduler is already producing.
let musicUserMuted = false;

export function setMusicUserEnabled(enabled: boolean): void {
  musicUserMuted = !enabled;
  if (!musicGainNode || !ctx) return;
  if (musicUserMuted) {
    musicGainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  } else {
    musicGainNode.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.1);
  }
}

export function setSFXGain(value: number): void {
  sfxVolume = Math.max(0, Math.min(1, value));
  if (sfxGainNode) {
    sfxGainNode.gain.setValueAtTime(sfxVolume, ctx?.currentTime || 0);
  }
}

let isMusicStopped = false;

export function stopMusic(): void {
  isMusicStopped = true;
  if (musicGainNode && ctx) {
    musicGainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }
  // Tear down the lookahead scheduler — otherwise its interval keeps waking
  // the CPU every tick forever after the music ends (battery drain), and
  // startMusic() could never re-arm cleanly.
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  isMusicPlaying = false;
}

export function resumeMusic(): void {
  isMusicStopped = false;
  const c = getCtx();
  if (c.state === 'suspended') {
    void c.resume();
  }
  if (musicGainNode && ctx && !musicUserMuted) {
    musicGainNode.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.1);
  }
}

export function resumeAudioContext(): Promise<void> {
  const c = getCtx();
  // iOS Safari: after a call/Siri/backgrounding the context sits in the
  // WebKit-only 'interrupted' state (not 'suspended'), and resume()'s promise
  // can hang FOREVER on older versions. resume() must still be called inside
  // the tap gesture, but the wait is capped so no menu button ever dead-locks
  // on audio — the game starts and sound catches up when it can.
  if (c.state !== 'running') {
    const resumed = c.resume().catch(() => {});
    const deadline = new Promise<void>((resolve) => setTimeout(resolve, 400));
    return Promise.race([resumed, deadline]);
  }
  return Promise.resolve();
}

/**
 * 0 = ambient menu bed (pads + sparse arp), 1 = full arrangement.
 * Layers fade in progressively: bass → drums → hats → lead.
 */
let musicIntensity = 0.2;
export function setMusicIntensity(value: number): void {
  musicIntensity = Math.max(0, Math.min(1, value));
}

/** Muffle the soundtrack (paused / modal open) without stopping it. */
export function setMusicDucked(ducked: boolean): void {
  if (!ctx || !duckFilter) return;
  duckFilter.frequency.setTargetAtTime(ducked ? 700 : 18000, ctx.currentTime, 0.12);
}

// =========================================================================
// SOUNDTRACK — lookahead sequencer
// =========================================================================

const BPM = 110;
const SIXTEENTH = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS_PER_CHORD = 2;
const SWING = 0.14; // fraction of a sixteenth added to odd steps

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  bass: number; // midi
  pad: number[]; // pad voicing (smooth voice-leading)
  tones: number[]; // arp pool, low to high
}
interface LeadNote {
  step: number; // step within the chord block
  midi: number;
  len: number; // in sixteenths
}

/**
 * A MusicCue is one self-contained piece of music: its own progression,
 * lead hook, bass groove, and a `character` that reshapes the drums/arps.
 * The sequencer plays whichever cue is active; the MusicDirector swaps them
 * by game state (menu / exploration / boss / hacking / victory). Tempo stays
 * fixed (110 BPM) — identity comes from harmony + character, not BPM, so
 * switches never desync the running scheduler.
 */
type CueCharacter = 'ambient' | 'groove' | 'boss' | 'breach' | 'victory';
interface MusicCue {
  chords: Chord[];
  lead: LeadNote[][] | null; // per-chord phrases, or null for no lead
  bass: (number | null)[]; // 16-step interval pattern over the chord root
  character: CueCharacter;
  barsPerChord: number; // how many bars each chord holds
}

// Rolling 8th bass: root / octave with a fifth pickup — the synthwave engine.
const GROOVE_BASS: (number | null)[] = [
  0,
  null,
  0,
  null,
  12,
  null,
  0,
  null,
  0,
  null,
  12,
  null,
  0,
  null,
  7,
  null,
];
// Driving straight-8ths, root-heavy — boss relentlessness.
const BOSS_BASS: (number | null)[] = [
  0,
  null,
  0,
  0,
  0,
  null,
  0,
  null,
  12,
  null,
  0,
  0,
  7,
  null,
  7,
  null,
];
// Pulsing offbeat — the "ticking clock" of a live hack.
const BREACH_BASS: (number | null)[] = [
  0,
  null,
  7,
  null,
  0,
  null,
  7,
  null,
  0,
  null,
  7,
  null,
  5,
  null,
  7,
  null,
];

// --- EXPLORE: Am–F–C–G (i–VI–III–VII), the endless-resolving main groove ---
const EXPLORE_CHORDS: Chord[] = [
  { bass: 33, pad: [57, 60, 64, 69], tones: [57, 60, 64, 69, 72, 76] }, // Am
  { bass: 29, pad: [57, 60, 65, 69], tones: [53, 57, 60, 65, 69, 72] }, // F
  { bass: 36, pad: [55, 60, 64, 67], tones: [55, 60, 64, 67, 72, 76] }, // C
  { bass: 31, pad: [55, 59, 62, 67], tones: [55, 59, 62, 67, 71, 74] }, // G
];
const EXPLORE_LEAD: LeadNote[][] = [
  [
    { step: 0, midi: 76, len: 2 },
    { step: 4, midi: 74, len: 2 },
    { step: 6, midi: 72, len: 2 },
    { step: 8, midi: 69, len: 5 },
    { step: 20, midi: 72, len: 2 },
    { step: 22, midi: 74, len: 2 },
    { step: 24, midi: 76, len: 6 },
  ],
  [
    { step: 0, midi: 69, len: 2 },
    { step: 4, midi: 72, len: 2 },
    { step: 6, midi: 76, len: 2 },
    { step: 8, midi: 77, len: 6 },
    { step: 20, midi: 76, len: 2 },
    { step: 24, midi: 72, len: 5 },
  ],
  [
    { step: 0, midi: 79, len: 2 },
    { step: 4, midi: 76, len: 2 },
    { step: 6, midi: 74, len: 2 },
    { step: 8, midi: 76, len: 6 },
    { step: 20, midi: 72, len: 2 },
    { step: 24, midi: 67, len: 5 },
  ],
  [
    { step: 0, midi: 71, len: 2 },
    { step: 4, midi: 74, len: 2 },
    { step: 6, midi: 79, len: 2 },
    { step: 8, midi: 74, len: 4 },
    { step: 16, midi: 71, len: 2 },
    { step: 20, midi: 72, len: 2 },
    { step: 24, midi: 74, len: 6 },
  ],
];

// --- BOSS: Am–F–Dm–E (i–VI–iv–V), dread pulling back to the tonic. Low,
// heavy, minor; the E major V-chord is the menace. ---
const BOSS_CHORDS: Chord[] = [
  { bass: 33, pad: [57, 60, 64, 69], tones: [45, 48, 52, 57, 60, 64] }, // Am
  { bass: 29, pad: [57, 60, 65, 69], tones: [41, 45, 48, 53, 57, 60] }, // F
  { bass: 26, pad: [53, 57, 62, 65], tones: [38, 41, 45, 50, 53, 57] }, // Dm
  { bass: 28, pad: [56, 59, 64, 68], tones: [40, 44, 47, 52, 56, 59] }, // E
];
const BOSS_LEAD: LeadNote[][] = [
  [
    { step: 0, midi: 69, len: 3 },
    { step: 6, midi: 68, len: 2 },
    { step: 8, midi: 69, len: 4 },
    { step: 24, midi: 64, len: 6 },
  ],
  [
    { step: 0, midi: 65, len: 3 },
    { step: 8, midi: 69, len: 4 },
    { step: 24, midi: 68, len: 5 },
  ],
  [
    { step: 0, midi: 62, len: 3 },
    { step: 8, midi: 65, len: 4 },
    { step: 24, midi: 69, len: 5 },
  ],
  [
    { step: 0, midi: 68, len: 2 },
    { step: 4, midi: 71, len: 2 },
    { step: 8, midi: 68, len: 4 },
    { step: 24, midi: 64, len: 6 },
  ],
];

// --- BREACH: Am ↔ Bbm chromatic oscillation — unresolved, unstable, "inside
// the machine." One bar per chord so it churns. No kick/snare; the arp and a
// ticking hat carry a live-hack urgency. ---
const BREACH_CHORDS: Chord[] = [
  { bass: 45, pad: [57, 60, 64, 69], tones: [69, 72, 76, 79, 81, 84] }, // Am (high)
  { bass: 46, pad: [58, 61, 65, 70], tones: [70, 73, 77, 82, 84, 87] }, // Bbm (high)
];

// --- VICTORY: C–G–Am–F (I–V–vi–IV), the bright uplifting loop. ---
const VICTORY_CHORDS: Chord[] = [
  { bass: 36, pad: [55, 60, 64, 67], tones: [60, 64, 67, 72, 76, 79] }, // C
  { bass: 31, pad: [55, 59, 62, 67], tones: [59, 62, 67, 71, 74, 79] }, // G
  { bass: 33, pad: [57, 60, 64, 69], tones: [57, 60, 64, 69, 72, 76] }, // Am
  { bass: 29, pad: [57, 60, 65, 69], tones: [53, 57, 60, 65, 69, 72] }, // F
];
const VICTORY_LEAD: LeadNote[][] = [
  [
    { step: 0, midi: 72, len: 2 },
    { step: 4, midi: 76, len: 2 },
    { step: 8, midi: 79, len: 6 },
    { step: 24, midi: 84, len: 6 },
  ],
  [
    { step: 0, midi: 74, len: 2 },
    { step: 4, midi: 79, len: 2 },
    { step: 8, midi: 83, len: 6 },
    { step: 24, midi: 79, len: 5 },
  ],
  [
    { step: 0, midi: 76, len: 2 },
    { step: 4, midi: 72, len: 2 },
    { step: 8, midi: 69, len: 6 },
    { step: 24, midi: 76, len: 5 },
  ],
  [
    { step: 0, midi: 77, len: 2 },
    { step: 4, midi: 81, len: 2 },
    { step: 8, midi: 84, len: 6 },
    { step: 24, midi: 88, len: 6 },
  ],
];

const CUES: Record<string, MusicCue> = {
  // Menu shares the explore harmony but plays as an ambient bed (character
  // suppresses drums/lead regardless of intensity).
  menu: {
    chords: EXPLORE_CHORDS,
    lead: null,
    bass: GROOVE_BASS,
    character: 'ambient',
    barsPerChord: 2,
  },
  explore: {
    chords: EXPLORE_CHORDS,
    lead: EXPLORE_LEAD,
    bass: GROOVE_BASS,
    character: 'groove',
    barsPerChord: 2,
  },
  boss: {
    chords: BOSS_CHORDS,
    lead: BOSS_LEAD,
    bass: BOSS_BASS,
    character: 'boss',
    barsPerChord: 2,
  },
  breach: {
    chords: BREACH_CHORDS,
    lead: null,
    bass: BREACH_BASS,
    character: 'breach',
    barsPerChord: 1,
  },
  victory: {
    chords: VICTORY_CHORDS,
    lead: VICTORY_LEAD,
    bass: GROOVE_BASS,
    character: 'victory',
    barsPerChord: 2,
  },
};

let activeCue: MusicCue = CUES.menu;
let pendingCue: MusicCue | null = null;

/**
 * Request a musical cue. The swap lands on the next bar boundary so it's
 * always musically clean; passing the already-active cue is a no-op.
 */
export function setMusicCue(name: keyof typeof CUES | string): void {
  const cue = CUES[name];
  if (!cue || cue === activeCue) {
    if (cue === activeCue) pendingCue = null; // cancel a stale pending swap
    return;
  }
  pendingCue = cue;
}

export function resetMusicCue(): void {
  activeCue = CUES.menu;
  pendingCue = null;
}

let isMusicPlaying = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;
let stepIndex = 0; // global sixteenth counter

// Generous schedule-ahead so the soundtrack survives main-thread stalls on
// weak devices (a dropped 400ms frame must not punch a hole in the music).
// The cost is ~0.45s latency on intensity/layer changes — inaudible for fades.
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.45;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function startMusic() {
  if (isMusicPlaying) return;
  const c = getCtx();
  if (!c || !musicBus) return;
  if (c.state === 'suspended') void c.resume();

  isMusicPlaying = true;
  isMusicStopped = false;
  nextNoteTime = c.currentTime + 0.06;
  stepIndex = 0;

  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running' || isMusicStopped) return;
    // Catch up after background throttling without machine-gunning old steps.
    if (nextNoteTime < ctx.currentTime - 0.25) {
      nextNoteTime = ctx.currentTime + 0.05;
    }
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(stepIndex, nextNoteTime);
      nextNoteTime += SIXTEENTH;
      stepIndex++;
    }
  }, LOOKAHEAD_MS);
}

function scheduleStep(step: number, t: number): void {
  const stepInBar = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);

  // Apply a queued cue swap on the bar line so it's musically clean.
  if (stepInBar === 0 && pendingCue) {
    activeCue = pendingCue;
    pendingCue = null;
  }

  const cue = activeCue;
  const bpc = cue.barsPerChord;
  const stepsPerChord = STEPS_PER_BAR * bpc;
  const chordIdx = Math.floor(bar / bpc) % cue.chords.length;
  const chord = cue.chords[chordIdx];
  const stepInChord = step % stepsPerChord;
  const barIn16 = bar % 16;
  const isSectionB = barIn16 >= 8; // bars 8–15: fuller arrangement
  const isFillBar = barIn16 === 15; // last bar: drum fill into the loop top

  // Swing every odd sixteenth.
  if (stepInBar % 2 === 1) t += SIXTEENTH * SWING;

  const I = musicIntensity;

  // Per-cue character reshapes the drum/arp/lead behavior around the shared
  // instrument set. Everything below routes through these flags.
  const ch = cue.character;
  const isAmbient = ch === 'ambient';
  const isBoss = ch === 'boss';
  const isBreach = ch === 'breach';
  const isVictory = ch === 'victory';

  // Layer levels. Boss/victory force a full, loud arrangement; ambient/breach
  // suppress the kit; groove keeps the run-heat fade.
  const forceFull = isBoss || isVictory;
  const drums = isAmbient || isBreach ? 0 : forceFull ? 1 : clamp01((I - 0.25) / 0.35);
  const hats = isAmbient ? 0 : forceFull ? 1 : clamp01((I - 0.35) / 0.4);
  const bassLvl = isAmbient
    ? clamp01((I - 0.05) / 0.3) * 0.5
    : forceFull
      ? 1
      : clamp01((I - 0.15) / 0.3);
  const leadLvl = cue.lead === null ? 0 : forceFull ? 1 : clamp01((I - 0.5) / 0.3);
  const arpLvl = isBreach ? 1 : isAmbient ? 0.25 + 0.35 * I : 0.35 + 0.65 * I;
  const padLvl = (isBreach ? 0.7 : 1) - 0.25 * I;

  // PADS — retrigger on each chord change (length follows the cue's chord span).
  if (stepInChord === 0) {
    playPad(t, chord.pad, padLvl, bpc);
  }

  // KICK — four-on-floor for groove/victory; driving 8ths for the boss.
  if (drums > 0) {
    if (isBoss) {
      if (stepInBar % 2 === 0) {
        playKick(t, (stepInBar % 4 === 0 ? 0.6 : 0.4) * drums);
        pumpSidechain(t);
      }
    } else if (stepInBar % 4 === 0) {
      playKick(t, 0.5 * drums);
      pumpSidechain(t);
    }
  }

  // SNARE — backbeat 2 & 4, harder in section B; boss adds ghost hits.
  if (drums > 0 && (stepInBar === 4 || stepInBar === 12)) {
    playSnare(t, (isSectionB || forceFull ? 0.24 : 0.13) * drums);
  }
  if (drums > 0 && isBoss && (stepInBar === 7 || stepInBar === 15)) {
    playSnare(t, 0.09 * drums); // ghost snares drive the boss forward
  }
  if (drums > 0 && isFillBar && stepInBar >= 8 && stepInBar % 2 === 0) {
    playSnare(t, 0.1 * drums * (0.5 + (stepInBar - 8) / 14));
  }

  // HATS — 8ths + offbeat accents; BREACH gets a quiet mechanical 16th tick.
  if (isBreach) {
    // Ticking clock: soft closed hat on every 16th, accent the downbeats.
    playHat(t, (stepInBar % 4 === 0 ? 0.05 : 0.022) * clamp01(0.4 + I), false);
  } else if (hats > 0) {
    const isEighth = stepInBar % 2 === 0;
    const accent = stepInBar % 4 === 2;
    if (isEighth) {
      playHat(t, (accent ? 0.09 : 0.05) * hats, false);
    } else if ((isSectionB || forceFull) && hats > 0.6) {
      playHat(t, 0.025 * hats, false);
    }
    if (stepInBar === 14 && bar % 2 === 1) {
      playHat(t, 0.07 * hats, true); // open hat pushes into the next bar
    }
  }

  // BASS — the cue's own groove pattern over the chord root.
  if (bassLvl > 0) {
    const iv = cue.bass[stepInBar];
    if (iv !== null) {
      const accent = stepInBar % 4 !== 0; // duck under the kick
      const octave = isBoss ? -12 : 0; // boss bass drops a register for weight
      playBass(t, midiHz(chord.bass + iv + octave), (accent ? 0.2 : 0.13) * bassLvl);
    }
  }

  // ARP — plucky 16ths cycling chord tones. BREACH is always dense (the
  // urgent data-stream); groove/victory thicken with intensity.
  {
    const pattern = isBreach ? [0, 3, 5, 2, 4, 1, 5, 3] : [0, 2, 4, 5, 4, 2, 1, 3];
    const idx = pattern[(step >> (isBreach ? 0 : 1)) % pattern.length];
    const dense = isBreach || isVictory || I > 0.55;
    if ((dense || stepInBar % 2 === 0) && arpLvl > 0) {
      const tone = chord.tones[idx % chord.tones.length] + (isBreach ? 0 : 12);
      const vel = (stepInBar % 4 === 0 ? 0.055 : 0.035) * arpLvl;
      playArp(t, midiHz(tone), vel);
    }
  }

  // LEAD — composed hook. Section B only for groove; boss/victory play it
  // throughout (they're always "full").
  if (leadLvl > 0 && cue.lead && (isSectionB || forceFull)) {
    const phrase = cue.lead[chordIdx % cue.lead.length];
    for (const n of phrase) {
      if (n.step === stepInChord) {
        playLead(t, midiHz(n.midi), n.len * SIXTEENTH, 0.075 * leadLvl);
      }
    }
  }

  // RISER — filtered noise swell over the final bar of the 16-bar cycle.
  if (isFillBar && stepInBar === 0 && !isBreach && !isAmbient && (forceFull || I > 0.4)) {
    playRiser(t, STEPS_PER_BAR * SIXTEENTH, 0.05);
  }
}

/** Kick-synced dip on pads/arp — the classic synthwave pump. */
function pumpSidechain(t: number): void {
  for (const g of [padPump, arpPump]) {
    if (!g) continue;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.setTargetAtTime(1, t + 0.1, 0.07);
  }
}

// --- MUSIC INSTRUMENTS ---

function playKick(t: number, vol: number): void {
  const c = ctx!;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(44, t + 0.09);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(gain);
  gain.connect(musicBus!);
  osc.start(t);
  osc.stop(t + 0.35);

  // Click transient so the kick cuts through on laptop speakers.
  const click = c.createOscillator();
  const clickGain = c.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(1100, t);
  click.frequency.exponentialRampToValueAtTime(300, t + 0.02);
  clickGain.gain.setValueAtTime(vol * 0.4, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  click.connect(clickGain);
  clickGain.connect(musicBus!);
  click.start(t);
  click.stop(t + 0.03);
}

function noiseBurst(t: number, dur: number): AudioBufferSourceNode {
  const c = ctx!;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.start(t);
  return src;
}

function playSnare(t: number, vol: number): void {
  const c = ctx!;
  const noise = noiseBurst(t, 0.16);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900;
  bp.Q.value = 0.8;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  noise.connect(bp);
  bp.connect(gain);
  gain.connect(musicBus!);

  const body = c.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(210, t);
  body.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const bodyGain = c.createGain();
  bodyGain.gain.setValueAtTime(vol * 0.6, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  body.connect(bodyGain);
  bodyGain.connect(musicBus!);
  body.start(t);
  body.stop(t + 0.1);
}

function playHat(t: number, vol: number, open: boolean): void {
  const c = ctx!;
  const dur = open ? 0.25 : 0.045;
  const noise = noiseBurst(t, dur);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8200;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(musicBus!);
}

function playBass(t: number, freq: number, vol: number): void {
  const c = ctx!;
  const saw = c.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = freq;
  const sq = c.createOscillator();
  sq.type = 'square';
  sq.frequency.value = freq * 0.5;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 0.16);
  lp.Q.value = 2;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  saw.connect(lp);
  sq.connect(lp);
  lp.connect(gain);
  gain.connect(musicBus!);
  saw.start(t);
  sq.start(t);
  saw.stop(t + 0.22);
  sq.stop(t + 0.22);
}

function playPad(t: number, midis: number[], vol: number, bars = BARS_PER_CHORD): void {
  const c = ctx!;
  const chordDur = STEPS_PER_BAR * bars * SIXTEENTH;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.linearRampToValueAtTime(1400 + 1200 * musicIntensity, t + chordDur * 0.5);
  lp.frequency.linearRampToValueAtTime(800, t + chordDur);
  const gain = c.createGain();
  const level = 0.05 * vol;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.7);
  gain.gain.setValueAtTime(level, t + chordDur - 0.6);
  gain.gain.linearRampToValueAtTime(0, t + chordDur + 0.4);
  lp.connect(gain);
  gain.connect(padPump!);
  gain.connect(musicVerbSend!);

  for (const m of midis) {
    for (const det of [-6, 5]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(m);
      osc.detune.value = det;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + chordDur + 0.5);
    }
  }
}

function playArp(t: number, freq: number, vol: number): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(600, t + 0.12);
  lp.Q.value = 4;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(arpPump!);
  gain.connect(delaySend!);
  osc.start(t);
  osc.stop(t + 0.18);
}

function playLead(t: number, freq: number, dur: number, vol: number): void {
  const c = ctx!;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.03);
  gain.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.08));
  gain.gain.linearRampToValueAtTime(0, t + dur + 0.05);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.connect(gain);
  gain.connect(musicBus!);
  gain.connect(delaySend!);
  gain.connect(musicVerbSend!);

  // Two softly-detuned squares + vibrato = classic synthwave lead.
  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vibGain = c.createGain();
  vibGain.gain.setValueAtTime(0, t);
  vibGain.gain.linearRampToValueAtTime(freq * 0.006, t + 0.25);
  vib.connect(vibGain);
  for (const det of [-4, 4]) {
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.detune.value = det;
    vibGain.connect(osc.frequency);
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }
  vib.start(t);
  vib.stop(t + dur + 0.1);
}

function playRiser(t: number, dur: number, vol: number): void {
  const c = ctx!;
  const noise = noiseBurst(t, dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
  bp.Q.value = 1.2;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + dur);
  gain.gain.setValueAtTime(0.0001, t + dur + 0.01);
  noise.connect(bp);
  bp.connect(gain);
  gain.connect(musicBus!);
}

// =========================================================================
// SFX — with per-sound rate gates + crowd attenuation
// =========================================================================

const lastPlayTime: Record<string, number> = {};
const crowd: Record<string, { windowStart: number; count: number }> = {};

/**
 * Returns a gain multiplier for this trigger, or 0 to skip it entirely.
 * Rapid repeats get progressively quieter instead of stacking into noise.
 */
function gate(key: string, minInterval: number): number {
  const c = getCtx();
  if (!c) return 0;
  const now = c.currentTime;
  if (now - (lastPlayTime[key] ?? -1) < minInterval) return 0;
  lastPlayTime[key] = now;

  const w = crowd[key];
  if (!w || now - w.windowStart > 0.3) {
    crowd[key] = { windowStart: now, count: 1 };
    return 1;
  }
  w.count++;
  return Math.max(0.3, Math.pow(0.72, w.count - 1));
}

/** ±cents random detune, keeps repeated SFX from sounding machine-stamped. */
const vary = (freq: number, cents = 60) =>
  freq * Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);

/** Soft "piu" — heard 5×/sec for 10 minutes, so it must stay gentle. */
export function playShoot() {
  const c = getCtx();
  if (!c || !sfxBus) return;
  const v = gate('shoot', 0.04);
  if (v === 0) return;
  const t = c.currentTime;
  const f = vary(1250, 80);

  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.07);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.05 * v, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.09);

  const sub = c.createOscillator();
  sub.frequency.setValueAtTime(f * 0.22, t);
  sub.frequency.exponentialRampToValueAtTime(f * 0.14, t + 0.05);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(0.03 * v, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  sub.connect(subGain);
  subGain.connect(sfxBus);
  sub.start(t);
  sub.stop(t + 0.07);
}

/** Layered boom: sub thump + filtered rumble + crackle. */
export function playExplosion() {
  const c = getCtx();
  if (!c || !sfxBus || !sfxVerbSend) return;
  const v = gate('explosion', 0.055);
  if (v === 0) return;
  const t = c.currentTime;

  const sub = c.createOscillator();
  sub.frequency.setValueAtTime(vary(130, 100), t);
  sub.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(0.3 * v, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  sub.connect(subGain);
  subGain.connect(sfxBus);
  sub.start(t);
  sub.stop(t + 0.32);

  const rumble = noiseBurst(t, 0.3);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, t);
  lp.frequency.exponentialRampToValueAtTime(200, t + 0.28);
  const rumbleGain = c.createGain();
  rumbleGain.gain.setValueAtTime(0.15 * v, t);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  rumble.connect(lp);
  lp.connect(rumbleGain);
  rumbleGain.connect(sfxBus);
  rumbleGain.connect(sfxVerbSend);

  const crackle = noiseBurst(t, 0.1);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = vary(950, 200);
  bp.Q.value = 1.1;
  const crackleGain = c.createGain();
  crackleGain.gain.setValueAtTime(0.07 * v, t);
  crackleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  crackle.connect(bp);
  bp.connect(crackleGain);
  crackleGain.connect(sfxBus);
}

// Collect streaks climb a pentatonic ladder — rapid pickups literally play a
// rising melody (the old API passed pitchMult = 1 + streak * 0.05).
const PENTA = [0, 2, 4, 7, 9];

/** Marimba-ish pickup blip. `pitchMult` ≥ 1 encodes the collect streak. */
export function playCollect(pitchMult = 1) {
  const c = getCtx();
  if (!c || !sfxBus || !sfxVerbSend) return;
  const v = gate('collect', 0.035);
  if (v === 0) return;
  const t = c.currentTime;

  const streak = Math.max(0, Math.round((pitchMult - 1) / 0.05));
  const degree = PENTA[streak % PENTA.length] + 12 * Math.floor(streak / PENTA.length);
  const f = 880 * Math.pow(2, degree / 12);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.07 * v, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  gain.connect(sfxBus);
  const send = c.createGain();
  send.gain.value = 0.25;
  gain.connect(send);
  send.connect(sfxVerbSend);

  for (const [mult, amp] of [
    [1, 1],
    [2, 0.35],
  ] as const) {
    const osc = c.createOscillator();
    osc.frequency.value = f * mult;
    const partial = c.createGain();
    partial.gain.value = amp;
    osc.connect(partial);
    partial.connect(gain);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

/** Player damage: dark thud — alarming but not harsh. */
export function playHurt() {
  const c = getCtx();
  if (!c || !sfxBus || !sfxVerbSend) return;
  const v = gate('hurt', 0.09);
  if (v === 0) return;
  const t = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(240, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.22);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.14 * v, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(sfxBus);
  gain.connect(sfxVerbSend);
  osc.start(t);
  osc.stop(t + 0.26);

  const sub = c.createOscillator();
  sub.frequency.setValueAtTime(90, t);
  sub.frequency.exponentialRampToValueAtTime(45, t + 0.16);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(0.12 * v, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  sub.connect(subGain);
  subGain.connect(sfxBus);
  sub.start(t);
  sub.stop(t + 0.2);
}

/** Shimmering chime run used by short fanfares. */
function chimeRun(notes: number[], spacing: number, vol: number, verb = 0.3): void {
  const c = getCtx();
  if (!c || !sfxBus || !sfxVerbSend) return;
  const t0 = c.currentTime;
  notes.forEach((midi, i) => {
    const t = t0 + i * spacing;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    gain.connect(sfxBus!);
    const send = c.createGain();
    send.gain.value = verb;
    gain.connect(send);
    send.connect(sfxVerbSend!);
    for (const det of [-5, 5]) {
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiHz(midi);
      osc.detune.value = det;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  });
}

/** Level up: rising A-major arpeggio — bright, rewarding, short. */
export function playLevelUp() {
  if (gate('levelup', 0.25) === 0) return;
  chimeRun([69, 73, 76, 81], 0.075, 0.085);
}

/** Chest open: noise sweep reveal into a fanfare. */
export function playChestOpen() {
  const c = getCtx();
  if (!c || !sfxBus) return;
  if (gate('chest', 0.25) === 0) return;
  const t = c.currentTime;

  const sweep = noiseBurst(t, 0.3);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(5200, t + 0.28);
  bp.Q.value = 1.4;
  const sweepGain = c.createGain();
  sweepGain.gain.setValueAtTime(0.001, t);
  sweepGain.gain.exponentialRampToValueAtTime(0.05, t + 0.26);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  sweep.connect(bp);
  bp.connect(sweepGain);
  sweepGain.connect(sfxBus);

  setTimeout(() => chimeRun([72, 76, 79, 84], 0.07, 0.08, 0.4), 240);
}

/** Upgrade pick: firm, satisfying confirm. */
export function playUpgradeSelect() {
  const c = getCtx();
  if (!c || !sfxBus) return;
  if (gate('upgrade', 0.15) === 0) return;
  const t = c.currentTime;

  const thunk = c.createOscillator();
  thunk.type = 'sine';
  thunk.frequency.setValueAtTime(180, t);
  thunk.frequency.exponentialRampToValueAtTime(90, t + 0.08);
  const thunkGain = c.createGain();
  thunkGain.gain.setValueAtTime(0.14, t);
  thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  thunk.connect(thunkGain);
  thunkGain.connect(sfxBus);
  thunk.start(t);
  thunk.stop(t + 0.11);

  chimeRun([76, 81], 0.06, 0.07);
}

/** Coin ding — two-step rise, second partial for sparkle. */
export function playCreditCollect() {
  const c = getCtx();
  if (!c || !sfxBus) return;
  const v = gate('credit', 0.05);
  if (v === 0) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(988, t); // B5
  osc.frequency.setValueAtTime(1319, t + 0.045); // E6
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.055 * v, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(gain);
  gain.connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.24);

  const sparkle = c.createOscillator();
  sparkle.frequency.setValueAtTime(2637, t + 0.045);
  const sparkleGain = c.createGain();
  sparkleGain.gain.setValueAtTime(0.0001, t);
  sparkleGain.gain.setValueAtTime(0.02 * v, t + 0.045);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  sparkle.connect(sparkleGain);
  sparkleGain.connect(sfxBus);
  sparkle.start(t);
  sparkle.stop(t + 0.2);
}

/** Shop purchase: coin pair + warm confirm. */
export function playMenuBuy() {
  const c = getCtx();
  if (!c || !sfxBus) return;
  if (gate('buy', 0.15) === 0) return;
  playCreditCollect();
  setTimeout(() => chimeRun([69, 76], 0.05, 0.06), 70);
}

/** Tiny UI tick for menu buttons. */
export function playMenuClick() {
  const c = getCtx();
  if (!c || !sfxBus) return;
  const v = gate('click', 0.03);
  if (v === 0) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1900, t);
  osc.frequency.exponentialRampToValueAtTime(1100, t + 0.02);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.035 * v, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  osc.connect(gain);
  gain.connect(sfxBus);
  osc.start(t);
  osc.stop(t + 0.035);
}

/** Overload ultimate: riser into a heavy sub drop. */
export function playOverloadTrigger() {
  const c = getCtx();
  if (!c || !sfxBus || !sfxVerbSend) return;
  if (gate('overload', 0.3) === 0) return;
  const t = c.currentTime;

  const riser = c.createOscillator();
  riser.type = 'sawtooth';
  riser.frequency.setValueAtTime(90, t);
  riser.frequency.exponentialRampToValueAtTime(480, t + 0.28);
  const riserLp = c.createBiquadFilter();
  riserLp.type = 'lowpass';
  riserLp.frequency.setValueAtTime(300, t);
  riserLp.frequency.exponentialRampToValueAtTime(3200, t + 0.28);
  const riserGain = c.createGain();
  riserGain.gain.setValueAtTime(0.001, t);
  riserGain.gain.exponentialRampToValueAtTime(0.11, t + 0.26);
  riserGain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  riser.connect(riserLp);
  riserLp.connect(riserGain);
  riserGain.connect(sfxBus);
  riser.start(t);
  riser.stop(t + 0.36);

  const drop = c.createOscillator();
  drop.frequency.setValueAtTime(220, t + 0.28);
  drop.frequency.exponentialRampToValueAtTime(38, t + 0.75);
  const dropGain = c.createGain();
  dropGain.gain.setValueAtTime(0.0001, t);
  dropGain.gain.setValueAtTime(0.24, t + 0.28);
  dropGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  drop.connect(dropGain);
  dropGain.connect(sfxBus);
  dropGain.connect(sfxVerbSend);
  drop.start(t);
  drop.stop(t + 0.85);

  const whoosh = noiseBurst(t, 0.5);
  const whooshLp = c.createBiquadFilter();
  whooshLp.type = 'lowpass';
  whooshLp.frequency.setValueAtTime(3000, t);
  whooshLp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  const whooshGain = c.createGain();
  whooshGain.gain.setValueAtTime(0.06, t);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  whoosh.connect(whooshLp);
  whooshLp.connect(whooshGain);
  whooshGain.connect(sfxBus);
}

/** Victory fanfare — triumphant major climb with shimmer. */
export function playVictory() {
  if (gate('victory', 1) === 0) return;
  chimeRun([69, 73, 76, 81, 85, 88], 0.11, 0.09, 0.45);
  setTimeout(() => chimeRun([81, 85, 88], 0.0, 0.07, 0.5), 750);
}

// =========================================================================
// CHEST CEREMONY FANFARE — the reveal gets its own music
// =========================================================================
// A bright C-lydian harp loop, completely distinct from the dark A-minor
// soundtrack (which ducks underneath it). Jackpots add a driving pulse and
// an octave-doubled sparkle layer. Closing plays a gliss + resolving chord.

const CEREMONY_BPM = 150;
const CEREMONY_SIXTEENTH = 60 / CEREMONY_BPM / 4;
// C5 E5 G5 B5 D6 B5 G5 E5 — lydian shimmer, loops seamlessly
const CEREMONY_ARP = [72, 76, 79, 83, 86, 83, 79, 76];
const CEREMONY_BELLS = [88, 86, 91, 84, 93, 88]; // sparse top-line pool

let ceremonyTimer: ReturnType<typeof setInterval> | null = null;
let ceremonyStep = 0;
let ceremonyNextTime = 0;
let ceremonyJackpot = false;

function ceremonyPluck(t: number, midi: number, vol: number, bright = false): void {
  const c = ctx!;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + (bright ? 0.5 : 0.28));
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(bright ? 6000 : 4200, t);
  lp.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
  lp.connect(gain);
  gain.connect(ceremonyBus!);
  for (const det of [-4, 4]) {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(midi);
    osc.detune.value = det;
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + 0.55);
  }
  // Bell partial an octave up gives the "treasure" glint.
  if (bright) {
    const sparkle = c.createOscillator();
    sparkle.frequency.value = midiHz(midi + 12);
    const sGain = c.createGain();
    sGain.gain.setValueAtTime(vol * 0.3, t);
    sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    sparkle.connect(sGain);
    sGain.connect(ceremonyBus!);
    sparkle.start(t);
    sparkle.stop(t + 0.45);
  }
}

function ceremonyPulse(t: number, vol: number): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(98, t); // G2 — dominant pedal under C lydian
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(gain);
  gain.connect(ceremonyBus!);
  osc.start(t);
  osc.stop(t + 0.16);
}

/** Start the ceremony loop and duck the main soundtrack underneath it. */
export function startChestFanfare(jackpot: boolean): void {
  const c = getCtx();
  if (!c || !ceremonyBus || !musicBus || ceremonyTimer) return;
  ceremonyJackpot = jackpot;
  ceremonyStep = 0;
  ceremonyNextTime = c.currentTime + 0.05;

  musicBus.gain.setTargetAtTime(MUSIC_BUS_GAIN * 0.15, c.currentTime, 0.12);

  // Opening flourish: fast rising strum into the loop.
  [72, 76, 79, 84].forEach((m, i) => ceremonyPluck(c.currentTime + i * 0.045, m, 0.09, true));

  ceremonyTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    if (ceremonyNextTime < ctx.currentTime - 0.25) {
      ceremonyNextTime = ctx.currentTime + 0.05;
    }
    while (ceremonyNextTime < ctx.currentTime + 0.3) {
      const step = ceremonyStep;
      const t = ceremonyNextTime;
      // Harp arp on every 16th
      ceremonyPluck(t, CEREMONY_ARP[step % CEREMONY_ARP.length], step % 8 === 0 ? 0.075 : 0.05);
      // Sparse bell top-line on offbeats every other bar
      if (step % 16 === 10 || (ceremonyJackpot && step % 16 === 4)) {
        ceremonyPluck(t, CEREMONY_BELLS[(step >> 4) % CEREMONY_BELLS.length], 0.06, true);
      }
      // Jackpot: driving pulse under the shimmer
      if (ceremonyJackpot && step % 4 === 0) {
        ceremonyPulse(t, 0.16);
      }
      ceremonyNextTime += CEREMONY_SIXTEENTH;
      ceremonyStep++;
    }
  }, 40);
}

/** Stop the loop with a resolving gliss + chord, and restore the soundtrack. */
export function endChestFanfare(): void {
  const c = getCtx();
  if (!c || !ceremonyBus || !musicBus) return;
  if (ceremonyTimer) {
    clearInterval(ceremonyTimer);
    ceremonyTimer = null;
  }

  const t0 = c.currentTime;
  // Rising gliss…
  [72, 76, 79, 83, 84, 88, 91, 96].forEach((m, i) => {
    ceremonyPluck(t0 + i * 0.035, m, 0.055);
  });
  // …into a held C-major chord with sparkle.
  [84, 88, 91].forEach((m) => ceremonyPluck(t0 + 0.32, m, 0.08, true));

  musicBus.gain.setTargetAtTime(MUSIC_BUS_GAIN, t0 + 0.5, 0.3);
}

/** Per-item reveal hit: a quick 3-note strum that climbs with each item. */
export function playRevealStrum(index: number): void {
  const c = getCtx();
  if (!c || !ceremonyBus) return;
  const base = 76 + index * 3; // each reveal starts higher
  [0, 4, 7].forEach((iv, i) => {
    ceremonyPluck(c.currentTime + i * 0.04, base + iv, 0.085, i === 2);
  });
}

/** Defeat: slow descending minor motif, dark and final. */
export function playGameOver() {
  const c = getCtx();
  if (!c || !sfxBus || !sfxVerbSend) return;
  if (gate('gameover', 1) === 0) return;
  const t0 = c.currentTime;

  [64, 60, 57].forEach((midi, i) => {
    const t = t0 + 0.15 + i * 0.34;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (i === 2 ? 1.1 : 0.4));
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    lp.connect(gain);
    gain.connect(sfxBus!);
    gain.connect(sfxVerbSend!);
    for (const det of [-4, 4]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(midi - 12);
      osc.detune.value = det;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 1.2);
    }
  });
}
