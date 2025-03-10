import { Socket } from 'net'
import { WebSocketServer } from 'ws'
import ServerDefault from 'minecraft-protocol/src/server'
import { states, Client } from 'minecraft-protocol'

const clientIgnoredPackets = [
    'position'
]

class WebsocketConnectionSocket extends Socket {
    ws: import('ws').WebSocket
    id = ''
    private lastPacketTimestamps: number[] = []
    private static readonly MAX_PACKET_RATE = 200 // packets per second
    private static readonly MAX_PACKET_SIZE = 3 * 1024 * 1024 // 3MB in bytes
    private static readonly RATE_WINDOW = 1000 // 1 second window for rate limiting

    constructor(ws: import('ws').WebSocket, versionData, passwordValidation) {
        super()
        this.ws = ws
        let isFirstMessage = true
        let dropMessages = false

        this.ws.on('message', (data) => {
            if (dropMessages) return

            // Validate packet size
            if (Buffer.isBuffer(data) && data.length > WebsocketConnectionSocket.MAX_PACKET_SIZE) {
                this.emit('error', new Error('Packet too large'))
                this.end()
                return
            }

            // Validate packet rate
            const now = Date.now()
            this.lastPacketTimestamps = this.lastPacketTimestamps.filter(
                timestamp => now - timestamp < WebsocketConnectionSocket.RATE_WINDOW
            )
            this.lastPacketTimestamps.push(now)

            if (this.lastPacketTimestamps.length > WebsocketConnectionSocket.MAX_PACKET_RATE) {
                this.emit('error', new Error('Too many packets'))
                this.end()
                return
            }

            // if data is string "version" then output info
            if (isFirstMessage && Buffer.isBuffer(data) && Buffer.from(data).toString() === 'version') {
                this.ws.send(JSON.stringify(versionData))
                this.end()
                return
            }
            if (isFirstMessage && passwordValidation) {
                if (!Buffer.isBuffer(data) || Buffer.from(data).toString() !== passwordValidation) {
                    dropMessages = true
                    setTimeout(() => {
                        this.ws.send(JSON.stringify({
                            error: 'Invalid password'
                        }))
                        this.end()
                    }, 500)
                    return
                }
                isFirstMessage = false
                return
            }
            isFirstMessage = false
            // console.log('message', data)
            this.emit('data', data)
        })

        this.ws.on('close', () => {
            this.emit('end')
        })

        this.on('end', () => {
            this.ws.close()
        })

        this.ws.on('error', err => {
            this.emit('error', err)
        })
    }

    override write (data, callback) {
        // Validate outgoing packet size
        // if (Buffer.isBuffer(data) && data.length > WebsocketConnectionSocket.MAX_PACKET_SIZE) {
        //     this.emit('error', new Error('Outgoing packet too large'))
        //     this.end()
        //     return false
        // }

        // Validate outgoing packet rate
        // const now = Date.now()
        // this.lastPacketTimestamps = this.lastPacketTimestamps.filter(
        //     timestamp => now - timestamp < WebsocketConnectionSocket.RATE_WINDOW
        // )
        // this.lastPacketTimestamps.push(now)

        // if (this.lastPacketTimestamps.length > WebsocketConnectionSocket.MAX_PACKET_RATE) {
        //     this.emit('error', new Error('Too many outgoing packets'))
        //     this.end()
        //     return false
        // }

        // console.debug('write', data)
        this.ws.send(data, callback)
        return true
    }

    //@ts-expect-error
    end () {
        this.ws.close()
    }
}

export default class WebsocketServer extends (ServerDefault as any) {
    i = 0
    clientsPerIp = {}

    listen (port, host) {
        // implement it with websocket instead
        // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
        const self = this
        if (port === undefined) {
            this.socketServer = {
                close () {
                    // self.emit('close')
                },
            }
        } else {
            const ws = new WebSocketServer({ port })
            this.socketServer = ws
            ws.on('connection', (webSocket, req) => {
                self.newConnection(webSocket, req)
            })
            self.socketServer.on('error', err => {
                self.emit('error', err)
            })
            self.socketServer.on('close', () => {
                self.emit('close')
            })
            self.socketServer.on('listening', () => {
                self.emit('listening')
            })
        }
    }

    newConnection (webSocket, req) {
        // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
        const self = this
        const _socket = webSocket
        const versionData = {
            time: Date.now(),
            version: this.version,
            replEnabled: this.options.allowEval === true,
            consoleEnabled: this.options.sendConsole === true,
            requiresPass: Boolean(this.options.password),
            forwardChat: this.options.forwardChat === true,
            apiVersion: -1
            // todo
        }
        const socket = new WebsocketConnectionSocket(_socket, versionData, this.options.password)
        //@ts-expect-error
        const client: Client & { id } = new Client(true, this.version, this.customPackets, this.hideErrors)
        //@ts-expect-error
        client._end = client.end
        client.end = function (endReason, fullReason = JSON.stringify({ text: endReason })) {
            if (client.state === states.PLAY) {
                client.write('kick_disconnect', { reason: fullReason })
            } else if (client.state === states.LOGIN) {
                client.write('disconnect', { reason: fullReason })
            }

            //@ts-expect-error
            client._end(endReason)
        }

        const ip: string =
            /* req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split?.(',')?.[0] ||  */req.connection?.remoteAddress || req.socket.remoteAddress

        // Check IP whitelist if configured
        if (Array.isArray(this.options.ipFilter)) {
            if (!this.options.ipFilter.includes(ip)) {
                client.end('Your IP is not whitelisted')
                return
            }
        }

        _socket.remoteAddress = ip
        client.id = ip + this.i++
        socket.id = client.id
        this.clients[client.id] = client
        this.clientsPerIp[ip] ??= 0
        this.clientsPerIp[ip]++
        if (this.clientsPerIp[ip] > 30) {
            client.end('Too many connections from your IP')
            return
        }

        client.on('end', () => {
            delete self.clients[client.id]
            self.clientsPerIp[ip]--
        })
        //@ts-expect-error
        client.setSocket(socket)
        this.emit('connection', client)
    }

    close () {
        for (const clientId of Object.keys(this.clients)) {
            const client = this.clients[clientId]
            client.end('ServerShutdown')
        }

        this.socketServer.close()
    }

    writeToClients (clients, name, params) {
        if (clients.length === 0) return
        const buffer = this.serializer.createPacketBuffer({ name, params })
        for (const client of clients) client.writeRaw(buffer)
    }
}
