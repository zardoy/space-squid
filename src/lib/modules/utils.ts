import { TimerManager } from '../utils/timerManager'

const initServerTimers = (serv: Server) => {
  // Initialize timer manager
  serv.timerManager = new TimerManager()
  serv.cleanupFunctions.push(() => serv.timerManager.cleanup())

  // Add convenience methods to server
  serv.setInterval = (callback: () => void, ms: number) => {
    return serv.timerManager.setInterval(callback, ms)
  }

  serv.setTimeout = (callback: () => void, ms: number) => {
    return serv.timerManager.setTimeout(callback, ms)
  }

  serv.clearInterval = (interval: NodeJS.Timeout) => {
    serv.timerManager.clearInterval(interval)
  }

  serv.clearTimeout = (timeout: NodeJS.Timeout) => {
    serv.timerManager.clearTimeout(timeout)
  }
}

export const server = (serv: Server) => {
  initServerTimers(serv)
}

declare global {
  interface Server {
    setInterval (callback: () => void, ms: number): NodeJS.Timeout
    setTimeout (callback: () => void, ms: number): NodeJS.Timeout
    clearInterval (interval: NodeJS.Timeout): void
    clearTimeout (timeout: NodeJS.Timeout): void
    timerManager: TimerManager
  }
}
