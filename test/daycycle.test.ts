import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createSerializer, createDeserializer } from 'minecraft-protocol'
import { server as installDaycycle } from '../src/lib/modules/daycycle'

const installClientTime = require('mineflayer/lib/plugins/time')

describe.each(['1.8.8', '1.16.5'])('daylight cycle packets (%s)', (version) => {
  function setup (options: { time?: number, rule?: boolean, enabled?: boolean } = {}) {
    const serializer = createSerializer({ state: 'play', isServer: true, version })
    const deserializer = createDeserializer({ state: 'play', isServer: false, version })
    const client: any = new EventEmitter()
    client._client = new EventEmitter()
    installClientTime(client)

    const commands = new Map<string, any>()
    const server: any = Object.assign(new EventEmitter(), {
      time: options.time ?? 6000,
      doDaylightCycle: options.enabled ?? true,
      gamerules: { doDaylightCycle: options.rule },
      commands: { add: (command: any) => commands.set(command.base, command) },
      behavior: (_name: string, input: any, action: (input: any) => void) => action(input),
      info: () => {},
      _writeAll: (name: string, params: any) => {
        const buffer = serializer.createPacketBuffer({ name, params })
        const packet = deserializer.parsePacketBuffer(buffer).data
        client._client.emit(packet.name, packet.params)
      }
    })
    installDaycycle(server)
    return { server, client, commands }
  }

  it('tells the client to freeze when the gamerule is disabled', () => {
    const { server, client } = setup({ rule: false })
    server.emit('tick', 0.05, 20)
    expect(server.time).toBe(6000)
    expect(client.time.doDaylightCycle).toBe(false)
    expect(client.time.timeOfDay).toBe(6000)
  })

  it('also freezes when the server option disables the cycle', () => {
    const { server, client } = setup({ enabled: false, rule: true })
    server.setTime(13000)
    expect(server.time).toBe(13000)
    expect(client.time.doDaylightCycle).toBe(false)
    expect(client.time.timeOfDay).toBe(13000)
  })

  it('encodes frozen zero with the negative-one sentinel', () => {
    const { server, client } = setup({ time: 0, rule: false })
    server.emit('tick', 0.05, 20)
    expect(server.time).toBe(0)
    expect(client.time.doDaylightCycle).toBe(false)
    expect(client.time.timeOfDay).toBe(1)
  })

  it('keeps time commands frozen until the gamerule is enabled again', () => {
    const { server, client, commands } = setup({ rule: false })
    const command = commands.get('time')
    command.action(command.parse('set night'), {})
    expect(client.time.doDaylightCycle).toBe(false)
    expect(client.time.timeOfDay).toBe(13000)

    server.gamerules.doDaylightCycle = true
    server.emit('tick', 0.05, 20)
    expect(server.time).toBe(13020)
    expect(client.time.doDaylightCycle).toBe(true)
    expect(client.time.timeOfDay).toBe(13020)
  })

  it('preserves the default cycle and day rollover', () => {
    const { server, client } = setup({ time: 23980 })
    server.emit('tick', 0.05, 20)
    expect(server.time).toBe(0)
    expect(client.time.doDaylightCycle).toBe(true)
    expect(client.time.timeOfDay).toBe(0)
  })
})
