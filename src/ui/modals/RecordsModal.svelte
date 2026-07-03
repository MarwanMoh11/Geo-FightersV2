<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import {
    ACHIEVEMENTS,
    isAchievementUnlocked,
    getLifetimeStats,
  } from '../../core/ProgressManager';
  import { getTodaysQuests } from '../../core/DailyManager';
  import { playMenuClick } from '../../core/audio';
  import { fade, fly } from 'svelte/transition';

  let tab = $state<'achievements' | 'stats'>('achievements');

  // Snapshot when opened (stats don't change while the modal is up)
  let stats = $derived(uiState.showRecords ? getLifetimeStats() : null);
  let quests = $derived(uiState.showRecords ? getTodaysQuests() : []);

  function close() {
    playMenuClick();
    uiState.showRecords = false;
  }

  const fmt = (n: number) => n.toLocaleString('en-US');
</script>

{#if uiState.showRecords && stats}
  <div id="records-modal" transition:fade={{ duration: 180 }}>
    <div class="panel glass" in:fly={{ y: 24, duration: 300 }}>
      <header class="head">
        <h2 class="title">Records</h2>
        <div class="tabs">
          <button
            class="tab"
            class:active={tab === 'achievements'}
            onclick={() => (tab = 'achievements')}
          >
            UNLOCKS
          </button>
          <button class="tab" class:active={tab === 'stats'} onclick={() => (tab = 'stats')}>
            STATS
          </button>
        </div>
      </header>

      <div class="scroll-area">
        {#if tab === 'achievements'}
          {#if quests.length > 0}
            <div class="section-label">TODAY'S QUESTS</div>
            {#each quests as q (q.def.id)}
              <div class="ach-row" class:done={q.claimed}>
                <span class="ach-check">{q.claimed ? '✅' : '⬜'}</span>
                <div class="ach-info">
                  <span class="ach-name">{q.def.description}</span>
                  <span class="ach-desc">Reward: {q.def.reward}¢</span>
                </div>
              </div>
            {/each}
            <div class="section-label">ACHIEVEMENTS</div>
          {/if}

          {#each ACHIEVEMENTS as a (a.id)}
            {@const unlockedNow = isAchievementUnlocked(a.id)}
            {@const pct = Math.min(1, a.progress(stats) / a.target)}
            <div class="ach-row" class:done={unlockedNow}>
              <span class="ach-check">{unlockedNow ? '🏆' : '🔒'}</span>
              <div class="ach-info">
                <span class="ach-name">{a.name}</span>
                <span class="ach-desc">
                  {a.description}{a.unlock ? ` → ${a.unlock.label}` : ''}
                </span>
                {#if !unlockedNow}
                  <div class="ach-bar">
                    <div class="ach-fill" style="width: {Math.round(pct * 100)}%"></div>
                  </div>
                {/if}
              </div>
              {#if !unlockedNow}
                <span class="ach-pct">{Math.floor(pct * 100)}%</span>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="stats-grid">
            <div class="s">
              <span class="k">ENEMIES DESTROYED</span><span class="v">{fmt(stats.kills)}</span>
            </div>
            <div class="s">
              <span class="k">DAMAGE DEALT</span><span class="v"
                >{fmt(Math.round(stats.damageDealt))}</span
              >
            </div>
            <div class="s"><span class="k">RUNS</span><span class="v">{fmt(stats.runs)}</span></div>
            <div class="s"><span class="k">WINS</span><span class="v">{fmt(stats.wins)}</span></div>
            <div class="s">
              <span class="k">CHESTS OPENED</span><span class="v">{fmt(stats.chestsOpened)}</span>
            </div>
            <div class="s">
              <span class="k">EVOLUTIONS</span><span class="v">{fmt(stats.evolutions)}</span>
            </div>
            <div class="s">
              <span class="k">CREDITS EARNED</span><span class="v">{fmt(stats.creditsEarned)}</span>
            </div>
            <div class="s">
              <span class="k">VAULTS CRACKED</span><span class="v">{fmt(stats.vaultsCracked)}</span>
            </div>
            <div class="s">
              <span class="k">BEST TIME</span><span class="v"
                >{Math.floor(stats.bestTime / 60)}:{String(
                  Math.floor(stats.bestTime % 60),
                ).padStart(2, '0')}</span
              >
            </div>
            <div class="s">
              <span class="k">BEST LEVEL</span><span class="v">{fmt(stats.bestLevel)}</span>
            </div>
            <div class="s">
              <span class="k">BEST RUN KILLS</span><span class="v">{fmt(stats.bestKills)}</span>
            </div>
            <div class="s">
              <span class="k">DAILY STREAK</span><span class="v">{fmt(stats.dailyStreak)}</span>
            </div>
          </div>
        {/if}
      </div>

      <button class="btn close-btn" onclick={close}>Close</button>
    </div>
  </div>
{/if}

<style>
  #records-modal {
    position: fixed;
    inset: 0;
    z-index: 2500;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(4, 6, 15, 0.8);
    backdrop-filter: blur(10px);
    padding: calc(1rem + var(--safe-top, 0px)) 1rem calc(1rem + var(--safe-bottom, 0px));
    pointer-events: auto;
  }

  .panel {
    width: 100%;
    max-width: 420px;
    max-height: 100%;
    border-radius: var(--r-xl);
    padding: 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: var(--color-text-main);
  }

  .tabs {
    display: flex;
    gap: 0.35rem;
  }

  .tab {
    all: unset;
    cursor: pointer;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    padding: 0.4rem 0.7rem;
    border-radius: var(--r-pill);
    color: var(--color-text-dim);
    border: 1px solid var(--color-border);
  }

  .tab.active {
    color: #04060f;
    background: var(--color-primary);
    border-color: transparent;
  }

  .scroll-area {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 0.25rem;
  }

  .section-label {
    font-size: 0.56rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: var(--color-text-dim);
    margin-top: 0.4rem;
  }

  .ach-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.7rem;
    border-radius: var(--r-md);
    border: 1px solid var(--color-border);
  }

  .ach-row.done {
    border-color: rgba(255, 215, 94, 0.35);
    background: rgba(255, 215, 94, 0.05);
  }

  .ach-check {
    font-size: 1rem;
  }

  .ach-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .ach-name {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--color-text-main);
  }

  .ach-desc {
    font-size: 0.6rem;
    color: var(--color-text-dim);
  }

  .ach-bar {
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .ach-fill {
    height: 100%;
    background: var(--color-primary);
  }

  .ach-pct {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--color-text-dim);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .s {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.6rem 0.7rem;
    border-radius: var(--r-md);
    border: 1px solid var(--color-border);
  }

  .k {
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--color-text-dim);
  }

  .v {
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
  }

  .close-btn {
    all: unset;
    cursor: pointer;
    text-align: center;
    padding: 0.7rem;
    border-radius: var(--r-pill);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #04060f;
    background: var(--color-primary);
  }
</style>
