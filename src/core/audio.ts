// 1. Init Audio Context
let ctx: AudioContext | null = null;
let isMusicPlaying = false;

// --- BUFFER CACHE (Mobile Optimization) ---
// We pre-render expensive synth sounds into buffers so we don't creating 10+ AudioNodes per shot.
const buffers: Record<string, AudioBuffer> = {};

export function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

// Helper: Generate SFX Buffers once
async function generateBuffers() {
  const c = new (window.AudioContext || (window as any).webkitAudioContext)();

  // 1. SHOOT (Laser)
  buffers['shoot'] = await renderSynthToBuffer(c, 0.1, (t, osc, gain) => {
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  });

  // 2. EXPLOSION (Noise)
  // Manually write noise buffer (faster)
  const noiseLen = c.sampleRate * 0.5;
  const noiseBuf = c.createBuffer(1, noiseLen, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
  buffers['explosion'] = noiseBuf;

  // 3. COLLECT
  buffers['collect'] = await renderSynthToBuffer(c, 0.1, (t, osc, gain) => {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(2000, t + 0.1);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  });
}

// Helper: Render a synth patch to a buffer
function renderSynthToBuffer(
  ctx: AudioContext,
  duration: number,
  setup: (t: number, osc: OscillatorNode, gain: GainNode) => void,
): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, ctx.sampleRate * duration, ctx.sampleRate);
  const osc = offline.createOscillator();
  const gain = offline.createGain();
  osc.connect(gain);
  gain.connect(offline.destination);
  setup(0, osc, gain);
  osc.start(0);
  return offline.startRendering();
}

// --- MUSIC STATE ---
let currentBar = 0;
let currentStep = 0;
let rootNote = 55;
const PROGRESSION = [55, 43.65, 49, 36.7];
const LEAD_SCALE = [880, 1046, 1174, 1318, 1568];

// --- MAIN FUNCTIONALITY ---

// Mobile Audio Unlock
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();

  // 1. Play silent buffer
  const silent = c.createBuffer(1, 1, 22050);
  const source = c.createBufferSource();
  source.buffer = silent;
  source.connect(c.destination);
  source.start(0);

  // 2. Pre-generate heavy SFX
  if (!buffers['shoot']) generateBuffers();
}

export function startMusic() {
  if (isMusicPlaying) return;
  const c = getCtx();
  if (!c) return;
  isMusicPlaying = true;
  if (!buffers['shoot']) generateBuffers();

  // ... (Music Code omitted for brevity, keeping existing implementation structure in mind, but since I'm replacing the file I need to include it) ...
  // Actually, to save space/complexity I'll re-implement the drone engine simply or paste it back.
  // Re-pasting the music engine:

  const droneOsc = c.createOscillator();
  const droneGain = c.createGain();
  const droneFilter = c.createBiquadFilter();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 55;
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 100;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 50;
  lfo.connect(lfoGain);
  lfoGain.connect(droneFilter.frequency);
  lfo.start();
  droneGain.gain.value = 0.15;
  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(c.destination);
  droneOsc.start();

  setInterval(() => {
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime;
    if (currentStep % 64 === 0) {
      currentBar++;
      rootNote = PROGRESSION[currentBar % PROGRESSION.length];
      droneOsc.frequency.setTargetAtTime(rootNote, t, 0.1);
    }
    if (currentStep % 4 === 0) playKick(t);
    const isOffBeat = currentStep % 4 === 2;
    if (isOffBeat || Math.random() > 0.7) playHiHat(t, isOffBeat ? 0.05 : 0.02);
    if (currentStep % 4 !== 0) playBassNote(t, rootNote * (currentStep % 2 === 0 ? 1 : 2));
    if (Math.random() > 0.9) playLead(t, LEAD_SCALE[Math.floor(Math.random() * LEAD_SCALE.length)]);
    currentStep++;
  }, 135);
}

// --- OPTIMIZED SFX PLAYBACK ---

function playBuffer(name: string, playbackRate = 1.0, vol = 1.0) {
  const c = getCtx();
  if (!c || !buffers[name]) return;

  const source = c.createBufferSource();
  source.buffer = buffers[name];
  source.playbackRate.value = playbackRate;

  const gain = c.createGain();
  gain.gain.value = vol;

  source.connect(gain);
  gain.connect(c.destination);
  source.start();
}

export function playShoot() {
  playBuffer('shoot', 0.9 + Math.random() * 0.2); // Pitch var
}

export function playExplosion() {
  playBuffer('explosion', 0.8 + Math.random() * 0.4);
}

export function playCollect() {
  playBuffer('collect');
}

export function playLevelUp() {
  // Level Up is rare enough to keep synthesized
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

// --- MUSIC INSTRUMENTS (Lightweight) ---
// Kept inline for simplicity as they run on interval, not usually the cause of "spike on shoot" logic.
function playKick(t: number) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
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
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  osc.connect(f);
  f.connect(gain);
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
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(600, t);
  f.frequency.exponentialRampToValueAtTime(100, t + 0.1);
  osc.connect(f);
  f.connect(gain);
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
  gain.gain.setValueAtTime(0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
  const d = c.createDelay();
  d.delayTime.value = 0.25;
  const dg = c.createGain();
  dg.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(c.destination);
  gain.connect(d);
  d.connect(dg);
  dg.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.4);
}
