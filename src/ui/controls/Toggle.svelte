<script lang="ts">
  /** On/off switch. Real `role=switch` so screen readers announce state,
      and a 44px hit area even though the track is drawn smaller. */
  import { playMenuClick } from '../../core/audio';
  import { haptics } from '../../core/haptics';

  interface Props {
    checked: boolean;
    label: string;
    id?: string;
    disabled?: boolean;
    onchange: (next: boolean) => void;
  }

  let { checked, label, id, disabled = false, onchange }: Props = $props();

  function toggle() {
    if (disabled) return;
    playMenuClick();
    haptics.select();
    onchange(!checked);
  }
</script>

<button
  {id}
  class="toggle"
  class:checked
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
>
  <span class="track"><span class="thumb"></span></span>
</button>

<style>
  .toggle {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    flex: 0 0 auto;
    /* Track is 46×26 but the tap target is a full 44px tall — the old 22px
       switch was a coin-flip to hit on a small high-DPI phone. */
    width: 46px;
    height: var(--tap);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }
  .toggle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .track {
    position: relative;
    width: 46px;
    height: 26px;
    border-radius: var(--r-pill);
    background: var(--surface-sunken);
    border: 1px solid var(--color-border);
    transition:
      background var(--transition-smooth),
      border-color var(--transition-smooth);
  }
  .toggle.checked .track {
    background: var(--color-primary);
    border-color: transparent;
    box-shadow: 0 0 14px -3px rgba(54, 230, 255, 0.9);
  }

  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #cdd8ea;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    transition:
      transform var(--transition-springy),
      background var(--transition-smooth);
  }
  .toggle.checked .thumb {
    transform: translateX(20px);
    background: #04060f;
  }

  .toggle:active .thumb {
    width: 22px;
  }
</style>
