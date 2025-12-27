import { world } from '../core/world';

export let isGameOver = false;

// DOM Elements
const modal = document.getElementById('game-over-modal');
const finalLevel = document.getElementById('final-level');
const finalScore = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

// Setup Restart
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    location.reload(); // Hard Reset
  });
}

export function triggerGameOver() {
  if (isGameOver) return; // Prevent double trigger
  isGameOver = true;

  // Fetch Stats
  const player = world.with('isPlayer', 'level', 'score').first;
  const lvl = player?.level || 1;
  const score = player?.score || 0;

  // Populate UI
  if (finalLevel) finalLevel.innerText = lvl.toString().padStart(2, '0');
  if (finalScore) finalScore.innerText = score.toString();

  // Show Screen
  if (modal) modal.classList.remove('hidden');
}
