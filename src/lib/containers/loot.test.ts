import { describe, expect, it } from 'vitest'
import { fillContainer, JavaRandom, LootEnv } from './loot'

const env: LootEnv = {
  getTable: (id) => id === 'minecraft:chests/inner' ? { pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:apple' }] }] } : undefined,
  itemInfo: (name) => ['diamond', 'iron_ingot', 'apple', 'bread', 'iron_sword'].includes(name) ? { stackSize: name === 'iron_sword' ? 1 : 64, maxDurability: name === 'iron_sword' ? 250 : undefined } : undefined
}

describe('JavaRandom', () => {
  it('matches java.util.Random', () => {
    expect(new JavaRandom(42).nextInt()).toBe(-1170105035)
    const r = new JavaRandom(0)
    expect([r.nextInt(10), r.nextInt(10), r.nextInt(10)]).toEqual([0, 8, 9])
  })
})

describe('loot tables', () => {
  const table = {
    pools: [
      { rolls: { min: 2, max: 4 }, entries: [
        { type: 'minecraft:item', name: 'minecraft:diamond', weight: 1, modifier: { type: 'minecraft:set_count', count: { type: 'minecraft:uniform', min: 1, max: 3 } } },
        { type: 'minecraft:item', name: 'minecraft:iron_ingot', weight: 9, functions: [{ function: 'minecraft:set_count', count: 5 }] },
        { type: 'minecraft:empty', weight: 2 },
        { type: 'minecraft:item', name: 'minecraft:not_in_this_version', weight: 3 }
      ] },
      { rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:chests/inner' }] },
      { rolls: 1, condition: { type: 'minecraft:random_chance', chance: 0 }, entries: [{ type: 'minecraft:item', name: 'minecraft:bread' }] }
    ]
  }

  it('is repeatable for a seed and fills only existing slots', () => {
    const a = fillContainer(table, 27, 123n, env)
    const b = fillContainer(table, 27, 123n, env)
    expect(a).toEqual(b)
    const slots = a.map(([slot]) => slot)
    expect(new Set(slots).size).toBe(slots.length)
    expect(slots.every(s => s >= 0 && s < 27)).toBe(true)
    // the nested table always gives an apple, the 0 % pool never gives bread, unknown items are dropped
    expect(a.some(([, s]) => s.name === 'apple')).toBe(true)
    expect(a.some(([, s]) => s.name === 'bread' || s.name === 'not_in_this_version')).toBe(false)
  })

  it('differs between seeds', () => {
    const sets = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) sets.add(JSON.stringify(fillContainer(table, 27, BigInt(seed), env)))
    expect(sets.size).toBeGreaterThan(10)
  })

  it('respects the free slots and the total of the rolled count', () => {
    const only = [3, 7, 8]
    const out = fillContainer({ pools: [{ rolls: 1, entries: [{ type: 'item', name: 'iron_ingot', functions: [{ function: 'set_count', count: 20 }] }] }] }, 27, 5n, env, only)
    expect(out.every(([slot]) => only.includes(slot))).toBe(true)
    expect(out.reduce((n, [, s]) => n + s.count, 0)).toBe(20)
  })

  it('splits stacks over the stack size', () => {
    const out = fillContainer({ pools: [{ rolls: 1, entries: [{ type: 'item', name: 'iron_ingot', functions: [{ function: 'set_count', count: 150 }] }] }] }, 27, 9n, env)
    expect(out.reduce((n, [, s]) => n + s.count, 0)).toBe(150)
    expect(out.every(([, s]) => s.count <= 64)).toBe(true)
  })

  it('damages items by a fraction of their durability', () => {
    const out = fillContainer({ pools: [{ rolls: 1, entries: [{ type: 'item', name: 'iron_sword', modifier: { type: 'set_damage', damage: 0.5 } }] }] }, 27, 1n, env)
    expect(out[0][1].damage).toBe(125)
  })
})
