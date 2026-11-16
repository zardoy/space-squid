/**
 * The noise generator (minecraft-worldgen) only builds the 1.18+ overworld (384 blocks from y=-64) and throws for any other height range.
 * Worlds of older versions have no generator then: their saved chunks load as they are and new chunks are empty.
 */
export const generatorForWorldHeight = (name: string, minY: number, worldHeight: number) => {
  return name === 'noise' && (minY !== -64 || worldHeight !== 384) ? 'empty' : name
}
