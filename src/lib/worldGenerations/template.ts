import { Vec3 } from 'vec3'

/**
 * Default single-character → Minecraft block-name mapping used by the
 * chunk-template generator.  Users can override any entry (or add new ones)
 * via `generation.options.blockMap`.
 */
export const DEFAULT_BLOCK_MAP: Record<string, string> = {
  // 'A' is always air (skip – never written to the chunk)
  C: 'cobblestone',
  M: 'mossy_cobblestone',
  G: 'glass',
  R: 'red_wool',
  D: 'dark_oak_planks',
  I: 'iron_block',
  S: 'stone',
  B: 'bricks',
  W: 'oak_planks',
  L: 'lapis_block',
  O: 'obsidian',
  P: 'oak_planks',
  Y: 'gold_block',
  N: 'netherrack',
  T: 'stone_bricks',
  F: 'oak_log',
  E: 'emerald_block',
  X: 'tnt',
  Z: 'dirt',
  H: 'sandstone',
  J: 'glass_pane',
  K: 'gravel',
  Q: 'quartz_block',
  U: 'sea_lantern',
  V: 'stone_slab',
}

// ---------------------------------------------------------------------------
// Block-map parser
// ---------------------------------------------------------------------------

/**
 * Parses a block-map override string into a `Record<string, string>`.
 *
 * Format: comma-separated `CHAR=block_name` pairs (whitespace around
 * `=` and `,` is ignored).
 *
 * @example
 * parseBlockMap("C=cobblestone, G=glass_pane, X=diamond_block")
 * // → { C: 'cobblestone', G: 'glass_pane', X: 'diamond_block' }
 */
export function parseBlockMap(s: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of s.split(',')) {
    const eq = entry.indexOf('=')
    if (eq === -1) continue
    const char = entry.slice(0, eq).trim()
    const name = entry.slice(eq + 1).trim()
    if (char && name) result[char] = name
  }
  return result
}

// ---------------------------------------------------------------------------
// RLE decoder
// ---------------------------------------------------------------------------

/**
 * Expands a run-length-encoded row string.
 * "3B" → "BBB", "7A" → "AAAAAAA", bare "C" → "C".
 */
export function decodeRLE(s: string): string {
  let result = ''
  let i = 0
  while (i < s.length) {
    let numStr = ''
    while (i < s.length && s[i]! >= '0' && s[i]! <= '9') {
      numStr += s[i++]
    }
    if (i < s.length) {
      result += s[i++]!.repeat(numStr ? parseInt(numStr, 10) : 1)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Layer parser
// ---------------------------------------------------------------------------

export interface LayerData {
  /**
   * 0-based floor index as written in the template (Y0, Y1, …).
   * Absolute world Y = baseY + yIndex.
   */
  yIndex: number
  /** Fully decoded (RLE-expanded) row strings, one per Z offset */
  rows: string[]
}

/**
 * Parses a chunk-template string into an array of LayerData objects.
 *
 * Strict format:
 *   Y<n>: row0 | row1 | … | rowN-1  Y<n>: …
 *
 * - Layers are delimited by the next `Y<digits>:` token (no other separator).
 * - `<n>` is a 0-based floor index; the chunk generator maps it to world Y
 *   via `baseY + n` (default baseY = 64).
 * - Rows are separated by `|`.  Leading/trailing whitespace around each row
 *   is stripped before RLE decoding.
 * - Run-length encoding: `3C` → `CCC`, `7A` → `AAAAAAA`, bare `C` → `C`.
 * - `A` (or a space) represents air and is never written to the chunk.
 * - Width and depth are inferred from the decoded rows (no explicit header).
 *
 * @example
 * "Y0: 16C | 16C  Y1: C14AC | C14AC"
 */
export function parseTemplate(templateStr: string): LayerData[] {
  const layers: LayerData[] = []

  // Each match captures: [1] yIndex, [2] the rows blob up to the next Y<n>:
  const re = /Y(\d+):\s*([\s\S]*?)(?=\s*Y\d+:|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(templateStr)) !== null) {
    const yIndex = parseInt(m[1]!, 10)
    const rows = m[2]!
      .split('|')
      .map(r => decodeRLE(r.trim()))
      .filter(r => r.length > 0)

    if (rows.length === 0) {
      console.warn(`[chunkTemplate] Y${yIndex}: no rows found, skipping`)
      continue
    }

    layers.push({ yIndex, rows })
  }

  return layers
}

// ---------------------------------------------------------------------------
// Chunk generator factory
// ---------------------------------------------------------------------------

/**
 * Returns a `(chunkX, chunkZ) => Chunk` generator that paints the decoded
 * template structure into the world starting at (0, Y, 0).
 *
 * Chunks that do not overlap the structure are still returned but contain
 * only air + full sky-light (compatible with every generator contract).
 *
 * @param templateStr  Encoded template string (see parseTemplate).
 * @param options      generationOptions forwarded from world.ts
 *                     (must include `version`, and may include `minY` /
 *                     `worldHeight`).
 * @param userBlockMap Optional extra / override mappings on top of
 *                     DEFAULT_BLOCK_MAP.  char → Minecraft block name.
 */
export function makeTemplateGenerator(
  templateStr: string,
  options: any,
  userBlockMap?: Record<string, string> | string,
) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Chunk = require('prismarine-chunk')(options.version)
  const mcData = require('minecraft-data')(options.version)
  /* eslint-enable @typescript-eslint/no-require-imports */

  const minY: number = options.minY ?? 0
  const worldHeight: number = options.worldHeight ?? 256
  const baseY: number = options.baseY ?? 64
  const theFlattening: boolean = mcData.supportFeature('blockStateId')

  // Merge user overrides on top of defaults
  const resolvedMap = typeof userBlockMap === 'string' ? parseBlockMap(userBlockMap) : userBlockMap
  const blockMap = { ...DEFAULT_BLOCK_MAP, ...resolvedMap }

  // Resolve char → numeric block ID once at construction time
  const charToId: Record<string, number> = {}
  for (const [char, name] of Object.entries(blockMap)) {
    if (char === 'A') continue // air is always a skip
    const block = mcData.blocksByName[name as string]
    if (block) {
      charToId[char] = theFlattening ? (block.minStateId as number) : (block.id as number)
    } else {
      console.warn(`[chunkTemplate] Unknown block name for char '${char}': '${name}'`)
    }
  }

  // Build a sparse "wx,wy,wz" → blockId map covering the whole structure.
  // layer.yIndex is 0-based (Y0 = ground); world Y = baseY + yIndex.
  const blockGrid = new Map<string, number>()
  for (const layer of parseTemplate(templateStr)) {
    const wy = baseY + layer.yIndex
    for (let zi = 0; zi < layer.rows.length; zi++) {
      const row = layer.rows[zi]!
      for (let xi = 0; xi < row.length; xi++) {
        const char = row[xi]!
        if (char === 'A' || char === ' ') continue
        const id = charToId[char]
        if (id !== undefined) {
          blockGrid.set(`${xi},${wy},${zi}`, id)
        } else {
          console.warn(`[chunkTemplate] No block mapping for char '${char}'`)
        }
      }
    }
  }

  return (chunkX: number, chunkZ: number) => {
    const chunk = new Chunk({ minY, worldHeight })

    // Full sky-light (standard for surface/flat worlds)
    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let ly = minY; ly < minY + worldHeight; ly++) {
          chunk.setSkyLight(new Vec3(lx, ly, lz), 15)
        }
      }
    }

    const wx0 = chunkX * 16
    const wz0 = chunkZ * 16

    for (const [key, id] of blockGrid) {
      const parts = key.split(',')
      const wx = parseInt(parts[0]!, 10)
      const wy = parseInt(parts[1]!, 10)
      const wz = parseInt(parts[2]!, 10)

      const lx = wx - wx0
      const lz = wz - wz0
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) continue
      if (wy < minY || wy >= minY + worldHeight) continue

      const pos = new Vec3(lx, wy, lz)
      if (theFlattening) {
        chunk.setBlockStateId(pos, id)
      } else {
        chunk.setBlockType(pos, id)
      }
    }

    return chunk
  }
}
