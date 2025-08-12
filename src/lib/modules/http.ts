import { IncomingMessage, ServerResponse } from 'http'

export const server = function (serv: Server, options: Options) {
  serv.endpointsHandlers ??= {}

  if (options.debugEndpoints) {
    serv.endpointsHandlers['/log'] = (_req, res) => {
      const lines = serv._logBuffer?.join('\n') ?? 'No logs yet\n'
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(lines)
    }
    serv.endpointsHandlers['/errors'] = (_req, res) => {
      const lines = serv._errorBuffer?.join('\n') ?? 'No errors yet\n'
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(lines)
    }
  }
}

declare global {
  interface Options {
    debugEndpoints?: boolean
  }

  interface Server {
    _globalHttpHandler

    endpointsHandlers: {
      [path: string]: (req: IncomingMessage, res: ServerResponse) => void
    }
    /** @internal */
    _logBuffer?: string[]
    /** @internal */
    _errorBuffer?: string[]
  }
}
