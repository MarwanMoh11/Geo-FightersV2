/**
 * Shared icon lookups for weapons and passives.
 * Used by the inventory HUD and the upgrade cards.
 */

export const WEAPON_ICONS: Record<string, string> = {
  pulse_repeater: '/textures/ui/weapons/pulse_repeater.png',
  monowire_lash: '/textures/ui/weapons/monowire_lash.png',
  smart_rail_needles: '/textures/ui/weapons/smart_rail_needles.png',
  emp_pulse_node: '/textures/ui/weapons/emp_pulse_node.png',
  cryo_foam_disperser: '/textures/ui/weapons/cryo_foam_disperser.png',
  drone_halo: '/textures/ui/weapons/drone_halo.png',
  photon_blades: '/textures/ui/weapons/photon_blades.png',
  signal_hijacker: '/textures/ui/weapons/signal_hijacker.png',
  orbital_kill_ping: '🎯',
  overclock_engine: '🔥',
  memory_leak: '💾',
  omega_pulse: '/textures/ui/weapons/omega_pulse.png',
  nanofiber_guillotine: '/textures/ui/weapons/nanofiber_guillotine.png',
  magnetic_railstorm: '/textures/ui/weapons/magnetic_railstorm.png',
  blackout_field: '/textures/ui/weapons/blackout_field.png',
  thermal_collapse: '/textures/ui/weapons/thermal_collapse.png',
  swarm_intelligence: '/textures/ui/weapons/swarm_intelligence.png',
  photon_curtain: '/textures/ui/weapons/photon_curtain.png',
  neural_cascade: '/textures/ui/weapons/neural_cascade.png',
  saturation_strike: '☄️',
  runaway_singularity: '💥',
  heap_overflow: '🔮',
};

export const PASSIVE_ICONS: Record<string, string> = {
  power_cell: '⚡',
  accelerator_chip: '🚀',
  capacitor: '🔋',
  cooling_system: '❄️',
  clock_skipper: '⏱️',
  magnet_loader: '🧲',
  shield_matrix: '🛡️',
  regen_module: '💚',
  speed_boosters: '👟',
  ai_core: '🤖',
  optics_suite: '👁️',
  signal_booster: '📶',
  targeting_os: '🎯',
  quantum_regulator: '⚛️',
  debug_suite: '🐛',
};

export function getWeaponIcon(id: string): string {
  return WEAPON_ICONS[id] || '🔹';
}

export function getPassiveIcon(id: string): string {
  return PASSIVE_ICONS[id] || '🔸';
}
