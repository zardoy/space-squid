import { Vec3 } from 'vec3'
import { v4 as uuidv4 } from 'uuid'
import { EventEmitter } from 'events'

export const server = function (serv: Server) {
  serv.createFakePlayer = (options: FakePlayerOptions) => {
    // Create a fake client that mimics minecraft-protocol Client
    const fakeClient = new EventEmitter() as any
    fakeClient.version = serv.mcData.version.version!
    fakeClient.isServer = true
    fakeClient.isFake = true
    fakeClient.username = options.username
    fakeClient.uuid = options.uuid || uuidv4()
    fakeClient.latency = 0
    fakeClient.socket = { remoteAddress: '127.0.0.1', remotePort: 0 }
    fakeClient.registerChannel = () => { }
    fakeClient.writeChannel = () => { }
    fakeClient.end = (reason?: string) => {
      fakeClient.emit('end', reason)
    }
    fakeClient.write = () => { } // noop packet writer
    fakeClient.setState = () => {
      console.warn('setState is not supported for fake players')
    } // noop packet writer
    fakeClient.state = 'play'
    fakeClient.profile = {
      properties: []
    }

    return serv._addPlayer(fakeClient, { isFake: true })
  }
}

export interface FakePlayerOptions {
  username: string
  uuid?: string
}

declare global {
  interface Server {
    /**
     * Create a fake/AI player that appears like a real player
     * @param options Configuration for the fake player
     */
    createFakePlayer: (options: FakePlayerOptions) => Promise<Player | undefined>
  }

  interface Player {
    isFake?: boolean
  }
}
