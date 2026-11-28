import { describe, it, expect } from 'vitest'
import MinecraftData from 'minecraft-data'
import PrismarineItem from 'prismarine-item'
import { getResultingRecipe } from '../../src/lib/modules/crafting'

const data = MinecraftData('1.20.4')
const Item = PrismarineItem('1.20.4')
const planks = () => new Item(data.itemsByName.oak_planks.id, 1)

describe('shaped crafting alignment', () => {
  it('does not craft sticks from diagonally separated planks', () => {
    const slots = Array(9).fill(null)
    slots[3] = planks()
    slots[7] = planks()
    expect(getResultingRecipe(data, slots, 3)).toBeUndefined()
  })

  it('crafts sticks when their vertical recipe is offset to the bottom right', () => {
    const slots = Array(9).fill(null)
    slots[5] = planks()
    slots[8] = planks()
    const result = getResultingRecipe(data, slots, 3)
    expect(result?.type).toBe(data.itemsByName.stick.id)
    expect(result?.count).toBe(4)
  })

  it('does not collapse an empty row between planks', () => {
    const slots = Array(9).fill(null)
    slots[0] = planks()
    slots[6] = planks()
    expect(getResultingRecipe(data, slots, 3)).toBeUndefined()
  })

  it('preserves the internal gap in a boat recipe below an empty top row', () => {
    const slots = Array(9).fill(null)
    for (const index of [3, 5, 6, 7, 8]) slots[index] = planks()
    expect(getResultingRecipe(data, slots, 3)?.type).toBe(data.itemsByName.oak_boat.id)
  })

  it('still matches a shapeless recipe in an offset slot', () => {
    const slots = Array(9).fill(null)
    slots[8] = new Item(data.itemsByName.oak_log.id, 1)
    const result = getResultingRecipe(data, slots, 3)
    expect(result?.type).toBe(data.itemsByName.oak_planks.id)
    expect(result?.count).toBe(4)
  })

  it('returns no recipe for an empty grid', () => {
    expect(getResultingRecipe(data, Array(9).fill(null), 3)).toBeUndefined()
  })
})
