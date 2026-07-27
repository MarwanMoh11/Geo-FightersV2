<script lang="ts">
  import { uiState } from '../../core/UIState.svelte.ts';
  import { getNearestLocked, ACHIEVEMENTS, doubleRunPayout } from '../../core/ProgressManager';
  import { resetRun } from '../../core/runReset';
  import { setGameState } from '../../core/GameState';
  import { requestMidgameAd, requestRewardedAd, isRewardedAvailable } from '../../core/portal';
  import { playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';
  import Modal from '../Modal.svelte';

  let leaving = $state(false);
  // Guard against double taps while the rewarded request is in flight.
  let doubling = $state(false);

  /**
   * Offer the double only when a portal can actually serve the ad and there is
   * something to double. Hiding it beats showing a button that fails —
   * `isRewardedAvailable` also covers adblock, which is common on desktop web.
   */
  let canDouble = $derived(
    uiState.lastPayout.total > 0 && !uiState.payoutDoubled && isRewardedAvailable(),
  );

  function doublePayout() {
    if (doubling || uiState.payoutDoubled) return;
    playMenuClick();
    haptics.select();
    doubling = true;
    requestRewardedAd(
      () => {
        doubling = false;
        doubleRunPayout();
        haptics.select();
      },
      () => {
        // Portal rule: an ad that failed pays nothing. The offer stays up so
        // the player can retry rather than silently losing the opportunity.
        doubling = false;
      },
    );
  }

  /**
   * End of a run is the portal's natural interstitial break. Requested HERE
   * (player-initiated tap-through) instead of on GAME_OVER entry so it can
   * never collide with the rewarded SECOND CHANCE offer. Without an SDK the
   * callback runs immediately — identical to the old behavior.
   */
  function leave(then: () => void) {
    if (leaving) return;
    playMenuClick();
    haptics.select();
    leaving = true;
    requestMidgameAd(() => {
      // Brief fade-out so the tap feels acknowledged, then an IN-PLACE run
      // reset (no page reload — instant, keeps the app alive on mobile wrappers)
      setTimeout(() => {
        then();
        leaving = false;
      }, 220);
    });
  }

  /* `resetRun()` lands on the menu, so a straight "play again" has to push
     back into PLAYING afterwards — that's the same MENU→PLAYING transition
     the menu's Play button makes. Previously the only button said REBOOT
     but dropped you on the menu, which read as the button not working. */
  function playAgain() {
    leave(() => {
      resetRun();
      setGameState('PLAYING');
    });
  }

  function toMenu() {
    leave(resetRun);
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

<Modal
  open={uiState.gameState === 'GAME_OVER'}
  eyebrow={uiState.isVictory ? 'Run complete' : 'Run ended'}
  title={uiState.isVictory ? 'Corruption purged' : 'Fatal error'}
  subtitle={uiState.isVictory ? 'You survived the system.' : 'System integrity compromised.'}
  size="md"
  tone={uiState.isVictory ? 'green' : 'pink'}
  dismissible={false}
  class={leaving ? 'leaving' : ''}
>
  <div class="stats-grid">
    <div class="stat-card">
      <span class="value gold tnum">{minutes}:{seconds}</span>
      <span class="label">Time survived</span>
    </div>
    <div class="stat-card">
      <span class="value cyan tnum">{uiState.level}</span>
      <span class="label">Final level</span>
    </div>
    <div class="stat-card">
      <span class="value cyan tnum">{uiState.kills}</span>
      <span class="label">Threats purged</span>
    </div>
    <div class="stat-card">
      <span class="value pink tnum">×{uiState.bestCombo}</span>
      <span class="label">Best combo</span>
    </div>
  </div>

  <!-- The payout. Credits earned in a run used to vanish at the game-over
       screen — nothing ever moved them into the wallet, so the shop was
       unreachable. Now it banks, and the screen says so. -->
  {#if uiState.lastPayout.total > 0}
    <div class="payout">
      <div class="payout-head">
        <span class="payout-label">Credits banked</span>
        <strong class="payout-total tnum">🪙 {uiState.lastPayout.total}</strong>
      </div>
      <div class="payout-rows">
        <div class="payout-row">
          <span>Collected in run</span><span class="tnum">{uiState.lastPayout.collected}</span>
        </div>
        <div class="payout-row">
          <span>{uiState.isVictory ? 'Extraction bonus' : 'Depth bonus'}</span>
          <span class="tnum">+{uiState.lastPayout.bonus}</span>
        </div>
        {#if uiState.payoutDoubled}
          <div class="payout-row doubled">
            <span>Ad bonus</span>
            <span class="tnum">+{uiState.lastPayout.total}</span>
          </div>
        {/if}
        <div class="payout-row wallet">
          <span>Wallet</span><span class="tnum">🪙 {uiState.credits}</span>
        </div>
      </div>

      {#if canDouble}
        <button class="double-btn" disabled={doubling} onclick={doublePayout}>
          <span class="double-glyph" aria-hidden="true">▶</span>
          <span class="double-text">
            <span class="double-label">Double it</span>
            <span class="double-sub">
              {doubling ? 'Loading…' : `Watch an ad · +${uiState.lastPayout.total} credits`}
            </span>
          </span>
        </button>
      {/if}
    </div>
  {/if}

  {#if uiState.lastRunRank > 0}
    <div class="rank-badge" class:podium={uiState.lastRunRank <= 3}>
      <span aria-hidden="true">🌐</span> Global rank
      <strong class="tnum">#{uiState.lastRunRank}</strong>
      {#if uiState.lastRunRankTotal > 0}
        <span class="rank-of tnum">of {uiState.lastRunRankTotal}</span>
      {/if}
    </div>
  {/if}

  {#if scoreboard.length > 0}
    <section class="block">
      <h3 class="block-title">Squad scoreboard</h3>
      <div class="squad-board">
        {#each scoreboard as p, i (p.connectionId)}
          <div class="squad-row" class:me={p.isLocal}>
            <span class="squad-rank tnum">#{i + 1}</span>
            <span class="squad-name">{p.name}{p.isLocal ? ' (you)' : ''}</span>
            <span class="squad-kills tnum">☠ {p.kills}</span>
            <span class="squad-lv tnum">LV{p.level}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if earned.length > 0}
    <section class="block">
      <h3 class="block-title gold">Unlocked this run</h3>
      {#each earned as a (a.id)}
        <div class="unlock-row earned">
          <span class="unlock-icon" aria-hidden="true">🏆</span>
          <span class="unlock-text">
            {a.name}{a.unlock ? ` — ${a.unlock.label} unlocked` : ''}
          </span>
        </div>
      {/each}
    </section>
  {/if}

  {#if nearest.length > 0}
    <section class="block">
      <h3 class="block-title">Next unlocks</h3>
      {#each nearest as n (n.def.id)}
        <div class="unlock-row">
          <div class="unlock-info">
            <span class="unlock-text">{n.def.description}</span>
            {#if n.def.unlock}
              <span class="unlock-target">→ {n.def.unlock.label}</span>
            {/if}
          </div>
          <div class="unlock-meter">
            <div class="ui-meter">
              <div class="ui-meter-fill gold-fill" style="width: {Math.round(n.pct * 100)}%"></div>
            </div>
            <span class="unlock-pct tnum">{Math.round(n.pct * 100)}%</span>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  {#snippet footer()}
    <button class="ui-btn ghost" onclick={toMenu} disabled={leaving}>Main menu</button>
    {#if !uiState.isMultiplayer}
      <button class="ui-btn primary lg again" onclick={playAgain} disabled={leaving}>
        {uiState.isVictory ? 'Run it back' : 'Play again'}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  /* ---- Headline stats ---- */
  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: var(--sp-4);
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.85rem 0.5rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
  }
  .value {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }
  .label {
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    text-align: center;
  }
  .gold {
    color: var(--color-gold);
  }
  .cyan {
    color: var(--color-primary);
  }
  .pink {
    color: var(--color-secondary);
  }

  /* ---- Payout ---- */
  .payout {
    margin-bottom: var(--sp-4);
    padding: 0.7rem 0.85rem;
    border-radius: var(--r-md);
    border: 1px solid rgba(255, 216, 77, 0.45);
    background: rgba(255, 216, 77, 0.08);
  }
  .payout-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.45rem;
    margin-bottom: 0.45rem;
    border-bottom: 1px solid rgba(255, 216, 77, 0.22);
  }
  .payout-label {
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .payout-total {
    font-size: var(--fs-heading);
    color: var(--color-gold);
  }
  .payout-rows {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .payout-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: var(--fs-caption);
    color: var(--color-text-dim);
  }
  .payout-row.doubled {
    color: var(--color-gold);
    font-weight: 700;
  }
  .payout-row.wallet {
    margin-top: 0.3rem;
    padding-top: 0.35rem;
    border-top: 1px dashed rgba(255, 216, 77, 0.22);
    color: var(--color-text-main);
    font-weight: 700;
  }

  /* Rewarded-ad offer. Gold rather than the usual cyan so it reads as part of
     the payout it doubles, and full-width at --tap height because this is the
     one control on the screen we actively want thumbed on a phone. */
  .double-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: var(--tap);
    margin-top: 0.6rem;
    padding: 0.45rem 0.7rem;
    border-radius: var(--r-md);
    border: 1px solid rgba(255, 216, 77, 0.55);
    background: rgba(255, 216, 77, 0.14);
    color: var(--color-text-main);
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }
  .double-btn:hover:not(:disabled) {
    background: rgba(255, 216, 77, 0.22);
  }
  .double-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .double-glyph {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--r-pill);
    background: var(--color-gold);
    color: #1a1400;
    font-size: 0.7rem;
  }
  .double-text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .double-label {
    font-family: var(--font-heading);
    font-size: var(--fs-label);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-gold);
  }
  .double-sub {
    font-size: var(--fs-caption);
    color: var(--color-text-dim);
  }

  /* ---- Global rank ---- */
  .rank-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-bottom: var(--sp-4);
    padding: 0.6rem 1rem;
    border-radius: var(--r-md);
    border: 1px solid var(--color-border-bright);
    background: rgba(54, 230, 255, 0.08);
    font-size: var(--fs-caption);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-primary);
  }
  .rank-badge strong {
    font-size: var(--fs-heading);
  }
  .rank-badge.podium {
    border-color: rgba(255, 216, 77, 0.5);
    background: rgba(255, 216, 77, 0.1);
    color: var(--color-gold);
  }
  .rank-of {
    font-weight: 500;
    color: var(--color-text-dim);
  }

  /* ---- Sections ---- */
  .block {
    margin-bottom: var(--sp-4);
  }
  .block-title {
    margin: 0 0 0.45rem;
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .block-title.gold {
    color: var(--color-gold);
  }

  .squad-board {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .squad-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
    font-size: var(--fs-caption);
  }
  .squad-row.me {
    border-color: var(--color-border-bright);
    background: rgba(54, 230, 255, 0.08);
  }
  .squad-rank {
    flex: 0 0 auto;
    font-weight: 700;
    color: var(--color-text-dim);
  }
  .squad-name {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    color: var(--color-text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .squad-kills,
  .squad-lv {
    flex: 0 0 auto;
    font-size: var(--fs-micro);
    color: var(--color-text-dim);
  }

  .unlock-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    margin-bottom: 0.3rem;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    border: 1px solid var(--color-border);
  }
  .unlock-row.earned {
    flex-direction: row;
    align-items: center;
    gap: 0.55rem;
    border-color: rgba(255, 216, 77, 0.4);
    background: rgba(255, 216, 77, 0.08);
  }
  .unlock-icon {
    flex: 0 0 auto;
    font-size: 1rem;
  }
  .unlock-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .unlock-text {
    font-size: var(--fs-caption);
    line-height: 1.4;
    color: var(--color-text-main);
  }
  .unlock-target {
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-primary);
  }
  .unlock-meter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .unlock-meter .ui-meter {
    flex: 1;
    height: 4px;
  }
  .gold-fill {
    background: linear-gradient(90deg, #8a6b1f, var(--color-gold));
  }
  .unlock-pct {
    flex: 0 0 auto;
    font-size: var(--fs-micro);
    font-weight: 700;
    color: var(--color-gold);
  }

  /* The rematch is the action players want; the menu is the escape hatch. */
  .ui-btn.again {
    flex: 2;
  }

  @media (min-width: 641px) {
    .stats-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
</style>
