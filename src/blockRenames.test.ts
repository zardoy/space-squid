import { test, expect } from 'vitest'
import { getRenamedData } from './blockRenames'

test('works', () => {
  expect(getRenamedData('blocks', 'short_grass', '1.20.3', '1.8.8')).toEqual('tallgrass')
  expect(getRenamedData('blocks', ['standing_sign', 'grass'], '1.8.8', '1.16')).toEqual(['oak_sign', 'grass_block'])
  expect(getRenamedData('blocks', ['stone'], '1.8.8', '1.8.8')).toEqual(['stone'])
  expect(getRenamedData('blocks', ['stone'], '1.20.3', '1.20.3')).toEqual(['stone'])
  expect(getRenamedData('blocks', ['stone'], '1.8.8', '1.20.4')).toEqual(['stone'])
  expect(getRenamedData('blocks', ['planks'], '1.8.8', '1.20.4')).toEqual(['oak_planks'])
})
