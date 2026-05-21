import { describe, it, expect, vi } from 'vitest'

const parseMessage = (msg: string): string | Record<string, any> => {
  const trimmed = msg.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return msg
    }
  }
  return msg
}

const encodeChat = (message: string | Record<string, any>): string => {
  if (typeof message === 'string') {
    return JSON.stringify({ text: message })
  }
  return JSON.stringify(message)
}

describe('Title JSON Component Parsing', () => {
  it('should return plain text as-is', () => {
    expect(parseMessage('Hello world')).toBe('Hello world')
  })

  it('should parse JSON object components', () => {
    const result = parseMessage('{"text":"Hello","color":"red"}')
    expect(result).toEqual({ text: 'Hello', color: 'red' })
  })

  it('should parse JSON array components', () => {
    const result = parseMessage('[{"text":"Hello"},{"text":"World"}]')
    expect(result).toEqual([{ text: 'Hello' }, { text: 'World' }])
  })

  it('should handle plain text with curly braces', () => {
    const result = parseMessage('Hello {world}')
    expect(result).toBe('Hello {world}')
  })

  it('should fall back to string on invalid JSON', () => {
    const result = parseMessage('{"broken json}')
    expect(result).toBe('{"broken json}')
  })

  it('should handle empty strings', () => {
    expect(parseMessage('')).toBe('')
  })

  it('should trim whitespace before JSON detection', () => {
    const result = parseMessage('  {"text":"test"}')
    expect(result).toEqual({ text: 'test' })
  })

  it('should handle deeply nested JSON components', () => {
    const result = parseMessage('{"text":"A","extra":[{"text":"B","color":"red","bold":true}]}')
    expect(result).toEqual({ text: 'A', extra: [{ text: 'B', color: 'red', bold: true }] })
  })
})

describe('Title Chat Component Encoding', () => {
  it('should encode plain text as JSON chat component', () => {
    expect(encodeChat('Hello')).toBe('{"text":"Hello"}')
  })

  it('should encode JSON components as-is', () => {
    expect(encodeChat({ text: 'Hello', color: 'red' })).toBe('{"text":"Hello","color":"red"}')
  })

  it('should encode array components', () => {
    const arr = [{ text: 'A' }, { text: 'B' }]
    expect(encodeChat(arr)).toBe('[{"text":"A"},{"text":"B"}]')
  })
})
