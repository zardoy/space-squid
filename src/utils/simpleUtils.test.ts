import { spiral, ViewRect } from './index'
import { test, expect } from 'vitest'

test('spiral', () => {
  expect(spiral(0)).toEqual([[-0, -0]])
  expect(spiral(1)).toEqual([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]])
  expect(spiral(2).length).toEqual(25)
})

test('ViewRect', () => {
  const rect = new ViewRect(0, 0, 1)
  expect(rect.contains(0, 0)).toEqual(true)
  expect(rect.contains(0, 1)).toEqual(true)
  expect(rect.contains(0, 2)).toEqual(false)
})
