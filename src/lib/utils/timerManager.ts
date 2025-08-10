/**
 * Utility class to manage intervals and timeouts that can be cleaned up together
 */
export class TimerManager {
  private intervals: Set<NodeJS.Timeout> = new Set()
  private timeouts: Set<NodeJS.Timeout> = new Set()

  /**
   * Creates an interval that will be automatically cleared when cleanup is called
   */
  setInterval (callback: () => void, ms: number): NodeJS.Timeout {
    const interval = setInterval(callback, ms)
    this.intervals.add(interval)
    return interval
  }

  /**
   * Creates a timeout that will be automatically cleared when cleanup is called
   */
  setTimeout (callback: () => void, ms: number): NodeJS.Timeout {
    const timeout = setTimeout(callback, ms)
    this.timeouts.add(timeout)
    return timeout
  }

  /**
   * Clears a specific interval
   */
  clearInterval (interval: NodeJS.Timeout): void {
    clearInterval(interval)
    this.intervals.delete(interval)
  }

  /**
   * Clears a specific timeout
   */
  clearTimeout (timeout: NodeJS.Timeout): void {
    clearTimeout(timeout)
    this.timeouts.delete(timeout)
  }

  /**
   * Cleans up all intervals and timeouts
   */
  cleanup (): void {
    this.intervals.forEach(interval => clearInterval(interval))
    this.timeouts.forEach(timeout => clearTimeout(timeout))
    this.intervals.clear()
    this.timeouts.clear()
  }
}
