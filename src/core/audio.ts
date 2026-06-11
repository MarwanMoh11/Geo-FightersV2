// 1. Init Audio Context
let ctx: AudioContext | null = null;
let isMusicPlaying = false;
let isMusicStopped = false;

// --- GAIN NODES FOR VOLUME CONTROL ---
let masterGainNode: GainNode | null = null;
let musicGainNode: GainNode | null = null;
let sfxGainNode: GainNode | null = null;

// Volume multipliers (0-1)
let masterVolume = 0.8;
let musicVolume = 0.6;
let sfxVolume = 0.8;

// --- MUSIC STATE ---
let currentBar = 0;
let currentStep = 0;
let rootNote = 55; // Start at A1

// Frequencies for Bass: A1(55), F1(43.65), G1(49), D1(36.7)
const PROGRESSION = [55, 43.65, 49, 36.7];
const LEAD_SCALE = [880, 1046, 1174, 1318, 1568];

// Music oscillators (for stopping)
let droneOsc: OscillatorNode | null = null;
let lfoOsc: OscillatorNode | null = null;

export function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Create gain node hierarchy: source -> category gain -> master gain -> destination
    masterGainNode = ctx.createGain();
    masterGainNode.gain.value = masterVolume;
    masterGainNode.connect(ctx.destination);

    musicGainNode = ctx.createGain();
    musicGainNode.gain.value = musicVolume;
    musicGainNode.connect(masterGainNode);

    sfxGainNode = ctx.createGain();
    sfxGainNode.gain.value = sfxVolume;
    sfxGainNode.connect(masterGainNode);
  }
  return ctx;
}

// --- VOLUME CONTROL ---
export function setMasterGain(value: number): void {
  masterVolume = Math.max(0, Math.min(1, value));
  if (masterGainNode) {
    masterGainNode.gain.setValueAtTime(masterVolume, ctx?.currentTime || 0);
  }
}

export function setMusicGain(value: number): void {
  musicVolume = Math.max(0, Math.min(1, value));
  if (musicGainNode) {
    musicGainNode.gain.setValueAtTime(musicVolume, ctx?.currentTime || 0);
  }
}

export function setSFXGain(value: number): void {
  sfxVolume = Math.max(0, Math.min(1, value));
  if (sfxGainNode) {
    sfxGainNode.gain.setValueAtTime(sfxVolume, ctx?.currentTime || 0);
  }
}

export function stopMusic(): void {
  isMusicStopped = true;
  if (musicGainNode && ctx) {
    musicGainNode.gain.setValueAtTime(0, ctx.currentTime);
  }
}

export function resumeMusic(): void {
  isMusicStopped = false;
  const c = getCtx();
  if (c.state === 'suspended') {
    c.resume();
  }
  if (musicGainNode && ctx) {
    musicGainNode.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.1);
  }
}

export function resumeAudioContext(): Promise<void> {
  const c = getCtx();
  if (c.state === 'suspended') {
    return c.resume();
  }
  return Promise.resolve();
}

// --- SOUNDTRACK ENGINE ---

export function startMusic() {
  if (isMusicPlaying) return;

  const c = getCtx();
  if (!c || !musicGainNode) return;

  // Safety: Resume context if suspended
  if (c.state === 'suspended') {
    void c.resume();
  }

  isMusicPlaying = true;
  isMusicStopped = false; // Ensure it's not starting in a stopped state

  // A. THE DRONE (Atmosphere)
  droneOsc = c.createOscillator();
  const droneGain = c.createGain();
  const droneFilter = c.createBiquadFilter();

  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 55;

  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 120; // Slightly brighter

  // LFO for movement
  lfoOsc = c.createOscillator();
  lfoOsc.frequency.value = 0.1;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 50;
  lfoOsc.connect(lfoGain);
  lfoGain.connect(droneFilter.frequency);
  lfoOsc.start();

  // Volume
  droneGain.gain.value = 0.15;

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(musicGainNode);
  droneOsc.start();

  // B. THE SEQUENCER LOOP
  const localDroneOsc = droneOsc; // Capture for closure
  setInterval(() => {
    if (c.state !== 'running' || isMusicStopped) return;
    const t = c.currentTime; // Always get fresh time

    // 1. CONDUCTOR: Change Chords every 4 Bars (64 steps)
    if (currentStep % 64 === 0) {
      currentBar++;
      const chordIndex = currentBar % PROGRESSION.length;
      rootNote = PROGRESSION[chordIndex];
      localDroneOsc.frequency.setTargetAtTime(rootNote, t, 0.1);
    }

    // 2. KICK (Beat)
    if (currentStep % 4 === 0) {
      playKick(t);
    }

    // 3. HI-HATS (Randomized)
    const isOffBeat = currentStep % 4 === 2;
    if (isOffBeat || Math.random() > 0.7) {
      playHiHat(t, isOffBeat ? 0.08 : 0.03);
    }

    // 4. BASS (Rolling)
    if (currentStep % 4 !== 0) {
      const octave = currentStep % 2 === 0 ? 1 : 2;
      playBassNote(t, rootNote * octave);
    }

    // 5. LEAD MELODY (Rare)
    if (Math.random() > 0.92) {
      const note = LEAD_SCALE[Math.floor(Math.random() * LEAD_SCALE.length)];
      playLead(t, note);
    }

    currentStep++;
  }, 130); // ~115 BPM
}

// --- INSTRUMENTS (Using Linear Ramps for Safety) ---

function playKick(t: number) {
  const c = getCtx();
  if (!c || !musicGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);

  gain.gain.setValueAtTime(0.6, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.5);

  osc.connect(gain);
  gain.connect(musicGainNode);
  osc.start(t);
  osc.stop(t + 0.5);
}

function playHiHat(t: number, vol: number) {
  const c = getCtx();
  if (!c || !musicGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(8000, t);

  gain.gain.setValueAtTime(vol, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.05);

  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(musicGainNode);
  osc.start(t);
  osc.stop(t + 0.05);
}

function playBassNote(t: number, freq: number) {
  const c = getCtx();
  if (!c || !musicGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(0.15, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.2);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, t);
  filter.frequency.linearRampToValueAtTime(100, t + 0.1);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(musicGainNode);
  osc.start(t);
  osc.stop(t + 0.2);
}

function playLead(t: number, freq: number) {
  const c = getCtx();
  if (!c || !musicGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(0.08, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.4);

  // Simple Delay
  const delay = c.createDelay();
  delay.delayTime.value = 0.25;
  const delayGain = c.createGain();
  delayGain.gain.value = 0.3;

  osc.connect(gain);
  gain.connect(musicGainNode);
  gain.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(musicGainNode);

  osc.start(t);
  osc.stop(t + 0.4);
}

// --- SFX ---

export function playShoot() {
  const c = getCtx();
  if (!c || !sfxGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.linearRampToValueAtTime(100, c.currentTime + 0.1);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(sfxGainNode);
  osc.start();
  osc.stop(c.currentTime + 0.1);
}

export function playExplosion() {
  const c = getCtx();
  if (!c || !sfxGainNode) return;
  const bufferSize = c.sampleRate * 0.5;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, c.currentTime);
  filter.frequency.linearRampToValueAtTime(100, c.currentTime + 0.3);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGainNode);
  noise.start();
}

/**
 * XP pickup blip. `pitchMult` raises the tone for rapid collect streaks
 * (1.0 = base pitch).
 */
export function playCollect(pitchMult = 1) {
  const c = getCtx();
  if (!c || !sfxGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200 * pitchMult, c.currentTime);
  osc.frequency.linearRampToValueAtTime(2000 * pitchMult, c.currentTime + 0.1);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(sfxGainNode);
  osc.start();
  osc.stop(c.currentTime + 0.1);
}

/** Player damage: short low saw drop with a noise thud. */
export function playHurt() {
  const c = getCtx();
  if (!c || !sfxGainNode) return;
  const t = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.25);
  osc.connect(gain);
  gain.connect(sfxGainNode);
  osc.start(t);
  osc.stop(t + 0.25);

  const bufferSize = Math.floor(c.sampleRate * 0.12);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.12, t);
  noiseGain.gain.linearRampToValueAtTime(0, t + 0.12);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(sfxGainNode);
  noise.start(t);
}

export function playLevelUp() {
  const c = getCtx();
  if (!c || !sfxGainNode) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, c.currentTime);
  osc.frequency.linearRampToValueAtTime(800, c.currentTime + 0.5);
  gain.gain.setValueAtTime(0.1, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(sfxGainNode);
  osc.start();
  osc.stop(c.currentTime + 0.5);
}
