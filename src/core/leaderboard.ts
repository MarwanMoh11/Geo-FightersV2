/**
 * Global leaderboard client. Talks to the same server the co-op signaling uses
 * (HF Space in production) over plain HTTP, so it works in solo runs too — the
 * player never needs to be in a multiplayer session to post or view scores.
 */

import { getServerBaseUrl } from './network';
import { uiState } from './UIState.svelte';

export interface LeaderboardEntry {
  name: string;
  time: number; // seconds survived
  level: number;
  kills: number;
  character: string;
  victory: boolean;
  ts: number;
}

// Don't post throwaway runs (menu fiddling, instant deaths).
const MIN_SUBMIT_TIME = 30;
let submittedThisSession = false;

/** New run started (no-reload restart): allow the next result to submit. */
export function resetRunSubmission(): void {
  submittedThisSession = false;
  uiState.lastRunRank = 0;
  uiState.lastRunRankTotal = 0;
}

/** POST the just-finished run. Fire-and-forget; records rank in uiState. */
export function submitRunToLeaderboard(): void {
  if (submittedThisSession) return;
  if ((uiState.gameTime || 0) < MIN_SUBMIT_TIME) return;
  submittedThisSession = true;

  const entry = {
    name: uiState.playerName || 'ANON',
    time: Math.round(uiState.gameTime || 0),
    level: uiState.level || 1,
    kills: uiState.kills || 0,
    character: uiState.selectedCharacter || 'cypher',
    victory: !!uiState.isVictory,
  };

  fetch(`${getServerBaseUrl()}/leaderboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && typeof data.rank === 'number') {
        uiState.lastRunRank = data.rank;
        uiState.lastRunRankTotal = data.total || 0;
      }
    })
    .catch(() => {
      /* offline / server asleep — silently skip, the run still counts locally */
    });
}

/** GET the top runs for the leaderboard view. Returns [] on any failure. */
export async function fetchLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${getServerBaseUrl()}/leaderboard?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}
