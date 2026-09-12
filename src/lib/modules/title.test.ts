import { expect, test } from 'vitest'
import { server as titleModule } from './title'
import { server as playersModule } from './players'

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

test('sendActionBar uses chat position for clients before title action bars', () => {
  const { serv, player, writes } = createHarness('1.10')

  serv.sendActionBar(player, { text: 'Ready', color: 'green' })

  expect(writes).toEqual([
    {
      name: 'chat',
      params: {
        message: '{"text":"Ready","color":"green"}',
        position: 2
      }
    }
  ])
})

test('legacy title timing actions match 1.8-1.10 protocol layout', () => {
  const { serv, player, writes } = createHarness('1.10')

  serv.setTitleTimes(player, 1, 2, 3)
  serv.clearTitle(player)
  serv.resetTitle(player)

  expect(writes).toEqual([
    {
      name: 'title',
      params: { action: 2, fadeIn: 1, stay: 2, fadeOut: 3 }
    },
    {
      name: 'title',
      params: { action: 3 }
    },
    {
      name: 'title',
      params: { action: 4 }
    }
  ])
})

test('legacy title actions switch at 1.11 when actionbar was added', () => {
  const { serv, player, writes } = createHarness('1.11')

  serv.sendActionBar(player, { text: 'Ready' })
  serv.setTitleTimes(player, 4, 5, 6)
  serv.clearTitle(player)
  serv.resetTitle(player)

  expect(writes).toEqual([
    {
      name: 'title',
      params: { action: 2, text: '{"text":"Ready"}' }
    },
    {
      name: 'title',
      params: { action: 3, fadeIn: 4, stay: 5, fadeOut: 6 }
    },
    {
      name: 'title',
      params: { action: 4 }
    },
    {
      name: 'title',
      params: { action: 5 }
    }
  ])
})

test('sendTitleText writes text without resetting title times', () => {
  const { serv, player, writes } = createHarness('1.20.4')

  serv.sendTitleText(player, { text: 'Hello', color: 'gold' })

  expect(writes).toEqual([
    {
      name: 'set_title_text',
      params: { text: '{"text":"Hello","color":"gold"}' }
    }
  ])
})

test('title command preserves timings when sending title text', () => {
  const writes: Array<{ name: string, params: any }> = []
  const commands: Record<string, any> = {}
  const player = {
    type: 'player',
    _client: {
      write: (name, params) => writes.push({ name, params })
    }
  } as any
  const serv = {
    mcData: {},
    commands: {
      add: command => { commands[command.base] = command }
    },
    selectorString: () => [player],
    _createNetworkEncodedChatComponent: (value) => JSON.stringify(typeof value === 'string' ? { text: value } : value)
  } as any

  titleModule(serv, { version: '1.20.4' } as any)
  playersModule(serv, { version: '1.20.4' } as any)

  const titleCommand = commands.title
  titleCommand.action(titleCommand.parse('@a times 1 2 3'), {})
  titleCommand.action(titleCommand.parse('@a title {"text":"Hello"}'), {})

  expect(writes).toEqual([
    {
      name: 'set_title_time',
      params: { fadeIn: 1, stay: 2, fadeOut: 3 }
    },
    {
      name: 'set_title_text',
      params: { text: '{"text":"Hello"}' }
    }
  ])
})

test('title command rejects extra arguments for clear and reset', () => {
  const commands: Record<string, any> = {}
  const serv = {
    mcData: {},
    commands: {
      add: command => { commands[command.base] = command }
    },
    selectorString: () => [{ type: 'player', _client: { write: () => {} } }]
  } as any

  titleModule(serv, { version: '1.20.4' } as any)
  playersModule(serv, { version: '1.20.4' } as any)

  expect(() => commands.title.action(commands.title.parse('@a clear extra'), {})).toThrow('Clear does not accept extra arguments')
  expect(() => commands.title.action(commands.title.parse('@a reset extra'), {})).toThrow('Reset does not accept extra arguments')
})
