import { expect, test } from 'vitest'
import { server as titleModule } from './title'

const createHarness = (version: string) => {
  const writes: Array<{ name: string, params: any }> = []
  const serv = {
    _createNetworkEncodedChatComponent: (value) => JSON.stringify(typeof value === 'string' ? { text: value } : value)
  } as any
  const player = {
    _client: {
      write: (name, params) => writes.push({ name, params })
    }
  } as any

  titleModule(serv, { version } as any)
  return { serv, player, writes }
}

test('sendTitle writes JSON components using the 1.17+ title packets', () => {
  const { serv, player, writes } = createHarness('1.20.4')

  serv.sendTitle(player, { text: 'Hello', color: 'gold' })

  expect(writes).toEqual([
    {
      name: 'set_title_text',
      params: { text: '{"text":"Hello","color":"gold"}' }
    },
    {
      name: 'set_title_time',
      params: { fadeIn: 10, stay: 70, fadeOut: 20 }
    }
  ])
})

test('sendActionBar writes JSON components using legacy title packets', () => {
  const { serv, player, writes } = createHarness('1.16.5')

  serv.sendActionBar(player, { text: 'Ready', color: 'green' })

  expect(writes).toEqual([
    {
      name: 'title',
      params: {
        action: 2,
        text: '{"text":"Ready","color":"green"}'
      }
    }
  ])
})
