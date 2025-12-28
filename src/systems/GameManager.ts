import { world } from '../core/world';

export let isGameOver = false;
export let isVictory = false;

// DOM Elements
const modal = document.getElementById('game-over-modal');
const finalLevel = document.getElementById('final-level');
const finalScore = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const modalTitle = modal?.querySelector('h2');

// Setup Restart
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    location.reload(); // Hard Reset
  });
}

export function triggerGameOver() {
  if (isGameOver || isVictory) return; // Prevent double trigger
  isGameOver = true;

  // Fetch Stats
  const player = world.with('isPlayer', 'level', 'score').first;
  const lvl = player?.level || 1;
  const score = player?.score || 0;

  // Populate UI
  if (modalTitle) modalTitle.innerText = 'SYSTEM FAILURE';
  if (finalLevel) finalLevel.innerText = lvl.toString().padStart(2, '0');
  if (finalScore) finalScore.innerText = score.toString();

  // Show Screen
  if (modal) modal.classList.remove('hidden');
}

export function triggerVictory() {
  if (isGameOver || isVictory) return;
  isVictory = true;
  isGameOver = true; // Also stop game loop

  // Fetch Stats
  const player = world.with('isPlayer', 'level', 'score').first;
  const lvl = player?.level || 1;
  const score = player?.score || 0;

  // Populate UI with victory message
  if (modalTitle) modalTitle.innerText = '🏆 SURVIVED 🏆';
  if (finalLevel) finalLevel.innerText = lvl.toString().padStart(2, '0');
  if (finalScore) finalScore.innerText = score.toString();

  // Show Screen
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.borderColor = '#00ff00'; // Green border for victory
  }

  console.log('[VICTORY] Player survived the corruption!');
}
