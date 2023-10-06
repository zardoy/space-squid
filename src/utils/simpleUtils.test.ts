import { ViewRect } from './index'
import spiralloop from 'spiralloop'
import { test, expect } from 'vitest'
import { generateSpiralMatrix } from './spiral'

function spiralWrong(distance: number) {
  const arr = [distance * 2 + 1, distance * 2 + 1]
  const t: [number, number][] = [[0, 0]]
  spiralloop(arr, 0, (_x, _z) => {
    const x = _x - distance
    const z = _z - distance
    if (x === 0 && z === 0) return
    t.push([x, z])
  })
  return t
}

test('spiral', () => {
  expect(generateSpiralMatrix(1)).toMatchInlineSnapshot(`
    [
      [
        0,
        0,
      ],
      [
        1,
        0,
      ],
      [
        1,
        1,
      ],
      [
        0,
        1,
      ],
      [
        -1,
        1,
      ],
      [
        -1,
        0,
      ],
      [
        -1,
        -1,
      ],
      [
        0,
        -1,
      ],
      [
        1,
        -1,
      ],
    ]
  `)
  expect(generateSpiralMatrix(2).length).toEqual(25)
})

test('ViewRect', () => {
  const rect = new ViewRect(0, 0, 1)
  expect(rect.contains(0, 0)).toEqual(true)
  expect(rect.contains(0, 1)).toEqual(true)
  expect(rect.contains(0, 2)).toEqual(false)
})
