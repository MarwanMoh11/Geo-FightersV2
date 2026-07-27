<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import {
    ACHIEVEMENTS,
    isAchievementUnlocked,
    getLifetimeStats,
  } from '../../core/ProgressManager';
  import { getTodaysQuests } from '../../core/DailyManager';
  import { playMenuClick } from '../../core/audio';
  import { fetchLeaderboard, type LeaderboardEntry } from '../../core/leaderboard';
  import { getCharacter } from '../../core/CharacterRegistry';
  import Modal from '../Modal.svelte';

  let tab = $state<'achievements' | 'stats' | 'global'>('achievements');

  // Snapshot when opened (stats don't change while the modal is up)
  let stats = $derived(uiState.showRecords ? getLifetimeStats() : null);
  let quests = $derived(uiState.showRecords ? getTodaysQuests() : []);

  // Global leaderboard: fetched lazily the first time the tab is opened
  let board = $state<LeaderboardEntry[]>([]);
  let boardState = $state<'idle' | 'loading' | 'loaded' | 'empty' | 'error'>('idle');

  async function loadBoard() {
    boardState = 'loading';
    try {
      const entries = await fetchLeaderboard(25);
      board = entries;
      boardState = entries.length ? 'loaded' : 'empty';
    } catch {
      boardState = 'error';
    }
  }

  $effect(() => {
    if (uiState.showRecords && tab === 'global' && boardState === 'idle') {
      loadBoard();
    }
  });

  function close() {
    playMenuClick();
    uiState.showRecords = false;
  }

  const fmt = (n: number) => n.toLocaleString('en-US');
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const TABS = [
    { id: 'achievements', label: 'Unlocks' },
    { id: 'stats', label: 'Stats' },
    { id: 'global', label: 'Global' },
  ] as const;

  let unlockedCount = $derived(ACHIEVEMENTS.filter((a) => isAchievementUnlocked(a.id)).length);

  const STAT_ROWS = [
    { key: 'Enemies destroyed', get: (s: any) => fmt(s.kills) },
    { key: 'Damage dealt', get: (s: any) => fmt(Math.round(s.damageDealt)) },
    { key: 'Runs', get: (s: any) => fmt(s.runs) },
    { key: 'Wins', get: (s: any) => fmt(s.wins) },
    { key: 'Chests opened', get: (s: any) => fmt(s.chestsOpened) },
    { key: 'Evolutions', get: (s: any) => fmt(s.evolutions) },
    { key: 'Credits earned', get: (s: any) => fmt(s.creditsEarned) },
    { key: 'Vaults cracked', get: (s: any) => fmt(s.vaultsCracked) },
    { key: 'Best time', get: (s: any) => mmss(s.bestTime) },
    { key: 'Best level', get: (s: any) => fmt(s.bestLevel) },
    { key: 'Best run kills', get: (s: any) => fmt(s.bestKills) },
    { key: 'Daily streak', get: (s: any) => fmt(s.dailyStreak) },
  ];
</script>

<Modal
  open={uiState.showRecords && !!stats}
  eyebrow="Career"
  title="Records"
  size="md"
  tone="gold"
  backdropClose
  onclose={close}
>
  {#snippet readout()}
    <span class="ui-chip gold tnum">🏆 {unlockedCount}/{ACHIEVEMENTS.length}</span>
  {/snippet}

  <div class="ui-tabs" role="tablist" aria-label="Records sections">
    {#each TABS as t (t.id)}
      <button class="ui-tab" role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class="tab-body">
    {#if stats}
      {#if tab === 'achievements'}
        {#if quests.length > 0}
          <h3 class="section-label">Today's quests</h3>
          {#each quests as q (q.def.id)}
            <div class="ach-row" class:done={q.claimed}>
              <span class="ach-check" aria-hidden="true">{q.claimed ? '✅' : '⬜'}</span>
              <div class="ach-info">
                <span class="ach-name">{q.def.description}</span>
                <span class="ach-desc">Reward: {q.def.reward}¢</span>
              </div>
            </div>
          {/each}
          <h3 class="section-label">Achievements</h3>
        {/if}

        {#each ACHIEVEMENTS as a (a.id)}
          {@const unlockedNow = isAchievementUnlocked(a.id)}
          {@const pct = Math.min(1, a.progress(stats) / a.target)}
          <div class="ach-row" class:done={unlockedNow}>
            <span class="ach-check" aria-hidden="true">{unlockedNow ? '🏆' : '🔒'}</span>
            <div class="ach-info">
              <span class="ach-name">{a.name}</span>
              <span class="ach-desc">
                {a.description}{a.unlock ? ` → ${a.unlock.label}` : ''}
              </span>
              {#if !unlockedNow}
                <div class="ach-progress">
                  <div class="ui-meter">
                    <div
                      class="ui-meter-fill gold-fill"
                      style="width: {Math.round(pct * 100)}%"
                    ></div>
                  </div>
                  <span class="ach-pct tnum">{Math.floor(pct * 100)}%</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {:else if tab === 'stats'}
        <div class="stats-grid">
          {#each STAT_ROWS as row (row.key)}
            <div class="s">
              <span class="k">{row.key}</span>
              <span class="v tnum">{row.get(stats)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <!-- GLOBAL LEADERBOARD -->
        <div class="lb-head">
          <span class="lb-col rank">#</span>
          <span class="lb-col who">Fighter</span>
          <span class="lb-col time">Time</span>
          <span class="lb-col num">LV</span>
          <span class="lb-col num">☠</span>
        </div>
        {#if boardState === 'loading'}
          <div class="lb-note"><span class="spin"></span> Fetching global runs…</div>
        {:else if boardState === 'error'}
          <div class="lb-note">
            Couldn't reach the leaderboard server.
            <button class="ui-btn ghost retry" onclick={loadBoard}>Retry</button>
          </div>
        {:else if boardState === 'empty'}
          <div class="lb-note">No runs posted yet — be the first. Survive past 0:30 to rank.</div>
        {:else}
          {#each board as e, i (e.ts)}
            <div class="lb-row" class:top={i < 3}>
              <span class="lb-col rank tnum">{i + 1}</span>
              <span class="lb-col who">
                <span class="lb-char" aria-hidden="true">{getCharacter(e.character).icon}</span>
                <span class="lb-name">{e.name}</span>
                {#if e.victory}<span class="lb-win" title="Survived to 10:00">👑</span>{/if}
              </span>
              <span class="lb-col time tnum">{mmss(e.time)}</span>
              <span class="lb-col num tnum">{e.level}</span>
              <span class="lb-col num tnum">{fmt(e.kills)}</span>
            </div>
          {/each}
        {/if}
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    <button class="ui-btn primary" onclick={close}>Close</button>
  {/snippet}
</Modal>

<style>
  .tab-body {
    margin-top: var(--sp-4);
    min-height: 16rem;
  }

  .section-label {
    margin: 1rem 0 0.4rem;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .section-label:first-child {
    margin-top: 0;
  }

  /* ---- Achievements ---- */
  .ach-row {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.6rem 0.7rem;
    margin-bottom: 0.35rem;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
  }
  .ach-row.done {
    border-color: rgba(255, 216, 77, 0.35);
    background: rgba(255, 216, 77, 0.07);
  }
  .ach-check {
    flex: 0 0 auto;
    font-size: 1rem;
    line-height: 1.3;
  }
  .ach-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .ach-name {
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-text-main);
  }
  .ach-desc {
    font-size: var(--fs-micro);
    line-height: 1.4;
    color: var(--color-text-dim);
  }
  .ach-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }
  .ach-progress .ui-meter {
    flex: 1;
    height: 4px;
  }
  .gold-fill {
    background: linear-gradient(90deg, #8a6b1f, var(--color-gold));
  }
  .ach-pct {
    flex: 0 0 auto;
    font-size: var(--fs-micro);
    font-weight: 700;
    color: var(--color-gold);
  }

  /* ---- Stats ---- */
  .stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  .s {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 0.7rem;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
  }
  .k {
    font-size: var(--fs-caption);
    color: var(--color-text-dim);
  }
  .v {
    font-size: var(--fs-label);
    font-weight: 700;
    color: var(--color-text-main);
  }

  /* ---- Leaderboard ---- */
  .lb-head,
  .lb-row {
    display: grid;
    grid-template-columns: 1.7rem 1fr 3rem 2rem 2.6rem;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.6rem;
  }
  .lb-head {
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-faint);
    border-bottom: 1px solid var(--color-border);
  }
  .lb-row {
    margin-top: 0.25rem;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    font-size: var(--fs-caption);
  }
  .lb-row.top {
    border-color: rgba(255, 216, 77, 0.35);
    background: rgba(255, 216, 77, 0.07);
  }
  .lb-row.top .rank {
    color: var(--color-gold);
    font-weight: 800;
  }
  .lb-col.rank {
    color: var(--color-text-dim);
    font-weight: 700;
  }
  .lb-col.who {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }
  .lb-name {
    min-width: 0;
    font-weight: 700;
    color: var(--color-text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lb-col.time,
  .lb-col.num {
    text-align: right;
    color: var(--color-text-dim);
  }
  .lb-note {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    padding: 2rem 1rem;
    font-size: var(--fs-caption);
    line-height: 1.5;
    text-align: center;
    color: var(--color-text-dim);
  }
  .ui-btn.retry {
    flex: 0 0 auto;
  }
  .spin {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (min-width: 641px) {
    .stats-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
