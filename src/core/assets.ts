/**
 * Boot gate for the loading screen.
 *
 * There is deliberately nothing to preload: level textures are fetched lazily
 * by LevelSystem's own loader as each level builds, and everything else the
 * game draws is generated at runtime (canvas textures, geometry, procedural
 * audio). This resolves immediately and exists only so main.ts has one async
 * seam to hang renderer init off, and one place to reinstate real progress
 * reporting if we ever do ship a preload manifest.
 *
 * This file used to also export a `loadTexture` that handed back a 2x2 white
 * dummy for every path. Nothing imported it — LevelSystem has always had its
 * own real TextureLoader — but it read like the texture pipeline was stubbed
 * out globally, which is misleading enough to be worth deleting.
 */
export function preloadTextures(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (onProgress) onProgress(0, 1);
  return Promise.resolve();
}
