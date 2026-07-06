<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { getNearestLocked, ACHIEVEMENTS } from '../../core/ProgressManager';
  import { resetRun } from '../../core/runReset';
  import { fade, fly } from 'svelte/transition';

  let leaving = $state(false);

  function restart() {
    // Brief fade-out so the click feels acknowledged, then an IN-PLACE run
    // reset (no page reload — instant, keeps the app alive on mobile wrappers)
    leaving = true;
    setTimeout(() => {
      resetRun();
      leaving = false;
    }, 250);
  }

  // The "one more run" tease: what was earned + what's almost earned.
  let earned = $derived(
    uiState.unlocksThisRun.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a) => !!a),
  );
  let nearest = $derived(uiState.gameState === 'GAME_OVER' ? getNearestLocked(3) : []);

  // Co-op scoreboard: everyone in the party, top fragger first
  let scoreboard = $derived(
    uiState.isMultiplayer && uiState.party.length > 1
      ? [...uiState.party].sort((a, b) => b.kills - a.kills)
      : [],
  );

  let minutes = $derived(
    Math.floor(uiState.gameTime / 60)
      .toString()
      .padStart(2, '0'),
  );
  let seconds = $derived(
    Math.floor(uiState.gameTime % 60)
      .toString()
      .padStart(2, '0'),
  );
</script>

{#if uiState.gameState === 'GAME_OVER'}
  <div
    id="game-over-modal"
    class:victory={uiState.isVictory}
    class:leaving
    transition:fade={{ duration: 600 }}
  >
    <div class="modal-overlay"></div>

    <div class="game-over-content glass" in:fly={{ y: 40, duration: 600, delay: 250 }}>
      <div class="header">
        {#if uiState.isVictory}
          <h2 class="title win">CORRUPTION PURGED</h2>
          <div class="subtitle">YOU SURVIVED THE SYSTEM</div>
        {:else}
          <h2 class="title">FATAL ERROR</h2>
          <div class="subtitle">SYSTEM INTEGRITY COMPROMISED</div>
        {/if}
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="label">TIME SURVIVED</span>
          <span class="value gold">{minutes}:{seconds}</span>
        </div>
        <div class="stat-card">
          <span class="label">FINAL LEVEL</span>
          <span class="value cyan">{uiState.level}</span>
        </div>
        <div class="stat-card">
          <span class="label">THREATS PURGED</span>
          <span class="value cyan">{uiState.kills}</span>
        </div>
        <div class="stat-card">
          <span class="label">BEST COMBO</span>
          <span class="value pink">×{uiState.bestCombo}</span>
        </div>
      </div>

      {#if uiState.lastRunRank > 0}
        <div class="rank-badge" class:podium={uiState.lastRunRank <= 3}>
          🌐 GLOBAL RANK <strong>#{uiState.lastRunRank}</strong>
          {#if uiState.lastRunRankTotal > 0}<span class="rank-of"
              >of {uiState.lastRunRankTotal}</span
            >{/if}
        </div>
      {/if}

      {#if scoreboard.length > 0}
        <div class="squad-board">
          <div class="squad-heading">SQUAD SCOREBOARD</div>
          {#each scoreboard as p, i (p.connectionId)}
            <div class="squad-row" class:me={p.isLocal}>
              <span class="squad-rank tnum">#{i + 1}</span>
              <span class="squad-name">{p.name}{p.isLocal ? ' (YOU)' : ''}</span>
              <span class="squad-kills tnum">☠ {p.kills}</span>
              <span class="squad-lv tnum">LV{p.level}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if earned.length > 0}
        <div class="unlock-section">
          {#each earned as a (a.id)}
            <div class="unlock-row earned">
              <span class="unlock-icon">🏆</span>
              <span class="unlock-text"
                >{a.name}{a.unlock ? ` — ${a.unlock.label} UNLOCKED` : ''}</span
              >
            </div>
          {/each}
        </div>
      {/if}

      {#if nearest.length > 0}
        <div class="unlock-section">
          <div class="unlock-heading">NEXT UNLOCKS</div>
          {#each nearest as n (n.def.id)}
            <div class="unlock-row">
              <div class="unlock-info">
                <span class="unlock-text">{n.def.description}</span>
                {#if n.def.unlock}
                  <span class="unlock-target">→ {n.def.unlock.label}</span>
                {/if}
              </div>
              <div class="unlock-bar">
                <div class="unlock-fill" style="width: {Math.round(n.pct * 100)}%"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <button class="reboot-btn" onclick={restart}>
        <span class="btn-text">{uiState.isVictory ? 'RUN IT BACK' : 'INITIATE REBOOT'}</span>
        <span class="btn-subtext">RESTORE SYSTEM STATE</span>
      </button>
    </div>
  </div>
{/if}

<style>
  #game-over-modal {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(8, 4, 8, 0.7);
    backdrop-filter: blur(14px);
    transition: opacity 0.25s ease;
    padding: 1.5rem;
    pointer-events: auto;
  }

  #game-over-modal.victory {
    background: rgba(4, 10, 8, 0.7);
  }

  #game-over-modal.leaving {
    opacity: 0;
  }

  .modal-overlay {
    display: none;
  }

  .game-over-content {
    width: 100%;
    max-width: 360px;
    border-radius: var(--r-xl);
    padding: 2.25rem 1.5rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    text-align: center;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: var(--color-secondary);
  }
  .title.win {
    color: var(--color-accent);
  }

  .subtitle {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    margin-top: 0.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.035);
    padding: 0.9rem 0.5rem;
    border-radius: var(--r-md);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .stat-card .label {
    font-size: 0.5rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }

  .stat-card .value {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 1.3rem;
    font-weight: 700;
  }

  .cyan {
    color: var(--color-primary);
  }
  .pink {
    color: var(--color-secondary);
  }
  .gold {
    color: var(--color-gold);
  }

  .reboot-btn {
    all: unset;
    cursor: pointer;
    padding: 1.1rem;
    border-radius: var(--r-md);
    background: var(--color-secondary);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    transition: all var(--transition-fast);
  }
  .victory .reboot-btn {
    background: var(--color-accent);
    color: #04130d;
  }
  .reboot-btn:hover {
    filter: brightness(1.08);
  }
  .reboot-btn:active {
    transform: scale(0.985);
  }
  .reboot-btn .btn-text {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .reboot-btn .btn-subtext {
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  /* --- Global rank badge --- */
  .rank-badge {
    text-align: center;
    padding: 0.6rem;
    border-radius: 10px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
    border: 1px solid var(--color-border);
    background: rgba(255, 255, 255, 0.02);
  }
  .rank-badge strong {
    color: var(--color-primary);
    font-size: 0.95rem;
  }
  .rank-badge.podium {
    border-color: rgba(255, 215, 94, 0.4);
    background: rgba(255, 215, 94, 0.06);
  }
  .rank-badge.podium strong {
    color: #ffd75e;
  }
  .rank-of {
    opacity: 0.7;
    margin-left: 0.2rem;
  }

  /* --- Squad scoreboard (co-op) --- */
  .squad-board {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    text-align: left;
  }
  .squad-heading {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-text-dim);
  }
  .squad-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 0.72rem;
  }
  .squad-row.me {
    border-color: var(--color-border-bright);
    background: rgba(54, 230, 255, 0.07);
  }
  .squad-rank {
    flex: 0 0 auto;
    font-weight: 800;
    color: var(--color-text-dim);
  }
  .squad-name {
    flex: 1;
    font-weight: 700;
    color: var(--color-text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .squad-kills {
    flex: 0 0 auto;
    font-weight: 700;
    color: var(--color-primary);
  }
  .squad-lv {
    flex: 0 0 auto;
    color: var(--color-text-dim);
  }

  /* --- Unlock teases --- */
  .unlock-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
  }
  .unlock-heading {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--color-text-dim);
  }
  .unlock-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .unlock-row.earned {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    color: #ffd75e;
  }
  .unlock-info {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .unlock-text {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--color-text-main);
  }
  .unlock-target {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--color-primary);
    white-space: nowrap;
  }
  .unlock-bar {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .unlock-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--color-primary);
  }
</style>
