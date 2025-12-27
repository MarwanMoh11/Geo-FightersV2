// 1. Init Audio Context
let ctx: AudioContext | null = null;
let isMusicPlaying = false;

// --- MUSIC STATE ---
let currentBar = 0;
let currentStep = 0;
let rootNote = 55; // Start at A1

// Frequencies for Bass: A1(55), F1(43.65), G1(49), D1(36.7)
const PROGRESSION = [55, 43.65, 49, 36.7];
const LEAD_SCALE = [880, 1046, 1174, 1318, 1568];

export function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

// --- SOUNDTRACK ENGINE ---

export function startMusic() {
  if (isMusicPlaying) return;

  const c = getCtx();
  if (!c) return;

  // Safety: Resume context if suspended
  if (c.state === 'suspended') {
    c.resume().then(() => {
      console.log('Audio Context Resumed');
    });
  }

  console.log('♫ STARTING PROCEDURAL MUSIC ENGINE ♫');
  isMusicPlaying = true;

  // A. THE DRONE (Atmosphere)
  const droneOsc = c.createOscillator();
  const droneGain = c.createGain();
  const droneFilter = c.createBiquadFilter();

  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 55;

  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 120; // Slightly brighter

  // LFO for movement
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.1;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 50;
  lfo.connect(lfoGain);
  lfoGain.connect(droneFilter.frequency);
  lfo.start();

  // Volume
  droneGain.gain.value = 0.15;

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(c.destination);
  droneOsc.start();

  // B. THE SEQUENCER LOOP
  setInterval(() => {
    const t = c.currentTime; // Always get fresh time

    // 1. CONDUCTOR: Change Chords every 4 Bars (64 steps)
    if (currentStep % 64 === 0) {
      currentBar++;
      const chordIndex = currentBar % PROGRESSION.length;
      rootNote = PROGRESSION[chordIndex];
      droneOsc.frequency.setTargetAtTime(rootNote, t, 0.1);
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
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);

  gain.gain.setValueAtTime(0.6, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.5);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.5);
}

function playHiHat(t: number, vol: number) {
  const c = getCtx();
  if (!c) return;
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
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

function playBassNote(t: number, freq: number) {
  const c = getCtx();
  if (!c) return;
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
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

function playLead(t: number, freq: number) {
  const c = getCtx();
  if (!c) return;
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
  gain.connect(c.destination);
  gain.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(c.destination);

  osc.start(t);
  osc.stop(t + 0.4);
}

// --- SFX ---

export function playShoot() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.linearRampToValueAtTime(100, c.currentTime + 0.1);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.1);
}

export function playExplosion() {
  const c = getCtx();
  if (!c) return;
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
  gain.connect(c.destination);
  noise.start();
}

export function playCollect() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, c.currentTime);
  osc.frequency.linearRampToValueAtTime(2000, c.currentTime + 0.1);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.1);
}

export function playLevelUp() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, c.currentTime);
  osc.frequency.linearRampToValueAtTime(800, c.currentTime + 0.5);
  gain.gain.setValueAtTime(0.1, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.5);
}
