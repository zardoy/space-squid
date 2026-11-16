import { describe, expect, it } from 'vitest'
import { generatorForWorldHeight } from '../../src/lib/generatorForWorldHeight'

describe('generatorForWorldHeight', () => {
  it('keeps the noise generator for the 1.18+ overworld (384 blocks from y=-64)', () => {
    expect(generatorForWorldHeight('noise', -64, 384)).toBe('noise')
  })

  it('does not use the noise generator for older worlds (256 blocks from y=0), which it rejects', () => {
    expect(generatorForWorldHeight('noise', 0, 256)).toBe('empty')
  })

  it('leaves the other generators alone whatever the height', () => {
    expect(generatorForWorldHeight('superflat', 0, 256)).toBe('superflat')
    expect(generatorForWorldHeight('grass_field', 0, 256)).toBe('grass_field')
    expect(generatorForWorldHeight('empty', 0, 256)).toBe('empty')
  })
})
