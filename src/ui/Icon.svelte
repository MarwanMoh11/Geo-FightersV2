<script lang="ts">
  /**
   * The menu chrome's icon set.
   *
   * Every glyph is a 24x24 stroked path on `currentColor`, so it takes the
   * colour and the size of whatever label it sits beside. See the ICONS block
   * in tokens.css for the sizing contract and for why `.ui-glyph` is global.
   *
   * Adding one: keep the 1.7 stroke and the ~3.4 unit padding inside the
   * viewBox, or it will read heavier or smaller than the rest of the set.
   */
  export type IconName =
    | 'coin'
    | 'roster'
    | 'chip'
    | 'trophy'
    | 'tree'
    | 'friends'
    | 'daily'
    | 'globe'
    | 'lock'
    | 'settings'
    | 'help'
    | 'bolt'
    | 'unlock'
    | 'skull'
    | 'check'
    | 'box'
    | 'gauge';

  let { name }: { name: IconName } = $props();
</script>

<svg
  class="ui-glyph"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'coin'}
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="12" r="4.3" />
  {:else if name === 'roster'}
    <circle cx="12" cy="8.4" r="3.4" />
    <path d="M5.4 20.2a6.6 6.6 0 0 1 13.2 0" />
  {:else if name === 'chip'}
    <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2.2" />
    <path
      d="M10.2 3.5v3.7M13.8 3.5v3.7M10.2 16.8v3.7M13.8 16.8v3.7M3.5 10.2h3.7M3.5 13.8h3.7M16.8 10.2h3.7M16.8 13.8h3.7"
    />
  {:else if name === 'trophy'}
    <path d="M8 4.2h8v4.6a4 4 0 0 1-8 0z" />
    <path d="M8 5.6H5.4v1.1A3.4 3.4 0 0 0 8.8 10.1" />
    <path d="M16 5.6h2.6v1.1a3.4 3.4 0 0 1-3.4 3.4" />
    <path d="M12 12.9v3.1M8.9 20h6.2l-.7-4h-4.8z" />
  {:else if name === 'tree'}
    <path d="M12 20.4V9M12 13.4l4.6-3.5M12 13.4 7.4 9.9" />
    <circle cx="12" cy="6.6" r="2.4" />
    <circle cx="17.6" cy="8.4" r="1.9" />
    <circle cx="6.4" cy="8.4" r="1.9" />
  {:else if name === 'friends'}
    <circle cx="9.2" cy="8.6" r="3.2" />
    <path d="M3.5 19.6a5.7 5.7 0 0 1 11.4 0" />
    <path d="M16.3 6a3.2 3.2 0 0 1 0 5.2M17.7 13.7a5.7 5.7 0 0 1 2.8 5.4" />
  {:else if name === 'daily'}
    <rect x="3.6" y="5.4" width="16.8" height="15" rx="2.6" />
    <path d="M8.2 3.4v4M15.8 3.4v4M3.6 10.3h16.8" />
    <path d="M12 13v4.4M9.8 15.2h4.4" />
  {:else if name === 'globe'}
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.5 12h17" />
    <path d="M12 3.4a13.2 13.2 0 0 1 0 17.2 13.2 13.2 0 0 1 0-17.2z" />
  {:else if name === 'lock'}
    <rect x="4.9" y="10.4" width="14.2" height="9.7" rx="2.2" />
    <path d="M8.2 10.4V7.7a3.8 3.8 0 0 1 7.6 0v2.7" />
  {:else if name === 'unlock'}
    <rect x="4.9" y="10.4" width="14.2" height="9.7" rx="2.2" />
    <path d="M8.2 10.4V7.7a3.8 3.8 0 0 1 7.2-1.5" />
  {:else if name === 'settings'}
    <!-- Faders, not a cog: an eight-spoke gear collapses into a sun-like blob
         at the ~14px this renders at inside a .ui-btn label. -->
    <path d="M4 6.9h9.6M18.2 6.9H20M4 12h2.4M11 12h9M4 17.1h8.6M17.2 17.1H20" />
    <circle cx="15.9" cy="6.9" r="2.3" />
    <circle cx="8.7" cy="12" r="2.3" />
    <circle cx="14.9" cy="17.1" r="2.3" />
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="8.6" />
    <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.7" />
    <circle cx="12" cy="17.3" r="0.95" fill="currentColor" stroke="none" />
  {:else if name === 'bolt'}
    <path d="M13.3 2.9 5.5 13.4h5.2l-.8 7.7 7.6-10.5h-5.2z" />
  {:else if name === 'check'}
    <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3.4" />
    <path d="m8 12.2 2.9 2.9 5.1-6" />
  {:else if name === 'box'}
    <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3.4" />
  {:else if name === 'gauge'}
    <path d="M4 17.6a8.9 8.9 0 1 1 16 0" />
    <path d="m12 17.4 3.7-6.6" />
    <circle cx="12" cy="17.8" r="1.4" />
  {:else if name === 'skull'}
    <path
      d="M5.5 11.3a6.5 6.5 0 1 1 13 0v3a2 2 0 0 1-1.3 1.9l-.8.3v1.9a1.4 1.4 0 0 1-1.4 1.4H9a1.4 1.4 0 0 1-1.4-1.4v-1.9l-.8-.3a2 2 0 0 1-1.3-1.9z"
    />
    <circle cx="9.4" cy="11.4" r="1.7" />
    <circle cx="14.6" cy="11.4" r="1.7" />
  {/if}
</svg>
