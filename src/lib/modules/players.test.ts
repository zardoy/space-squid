import { expect, test } from 'vitest'
import UserError from '../user_error'
import { parseTitleMessage, parseTitleTimes } from './players'

test('parseTitleMessage accepts vanilla JSON text components', () => {
  expect(parseTitleMessage('{"text":"Hello","color":"gold"}')).toEqual({
    text: 'Hello',
    color: 'gold'
  })
})

test('parseTitleMessage preserves plain text messages', () => {
  expect(parseTitleMessage('Hello world')).toEqual('Hello world')
})

test('parseTitleMessage rejects invalid JSON components', () => {
  expect(() => parseTitleMessage('{"text":')).toThrow(UserError)
})

test('parseTitleTimes validates three non-negative numbers', () => {
  expect(parseTitleTimes('10 70 20')).toEqual({
    fadeIn: 10,
    stay: 70,
    fadeOut: 20
  })
  expect(() => parseTitleTimes('10 70')).toThrow(UserError)
  expect(() => parseTitleTimes('-1 70 20')).toThrow(UserError)
  expect(() => parseTitleTimes('1x 70 20')).toThrow(UserError)
})
