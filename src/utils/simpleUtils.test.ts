import { ViewRect } from './index'
import { test, expect } from 'vitest'
import { generateSpiralMatrix } from './spiral'

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
