<script lang="ts">
  import { uiState } from '../core/UIState.svelte.ts';
</script>

<!-- Screen-edge guidance arrows for off-screen points of interest.
     Data comes from WayfindingSystem at 10 Hz; pure DOM, zero renderer cost. -->
{#each uiState.poiArrows as arrow (arrow.id)}
  <div
    class="poi-arrow"
    style={`left:${arrow.leftPct}%; top:${arrow.topPct}%; --poi-color:${arrow.color};`}
  >
    <span class="chev" style={`transform: rotate(${arrow.angleDeg}deg);`}>➤</span>
    <span class="icon">{arrow.icon}</span>
    <span class="dist">{arrow.dist}m</span>
  </div>
{/each}

<style>
  .poi-arrow {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    pointer-events: none;
    z-index: 5;
    animation: poi-pulse 1.6s ease-in-out infinite;
  }

  .chev {
    font-size: 0.85rem;
    line-height: 1;
    color: var(--poi-color);
    text-shadow: 0 0 6px var(--poi-color);
  }

  .icon {
    font-size: 1.05rem;
    line-height: 1;
    filter: drop-shadow(0 0 5px var(--poi-color));
  }

  .dist {
    font-family: var(--font-mono);
    font-size: 0.5rem;
    font-weight: 700;
    color: var(--poi-color);
    opacity: 0.85;
  }

  @keyframes poi-pulse {
    0%,
    100% {
      opacity: 0.75;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .poi-arrow {
      animation: none;
    }
  }
</style>
