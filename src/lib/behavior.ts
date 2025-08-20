export type CustomEventEmitter = {
  emit (event: string, ...args: any[]): boolean
  emitThen (event: string, ...args: any[]): Promise<void>
}

export type CancelFunction = (defaultCancel?: boolean, hidden?: boolean) => void

export type BehaviorFunction<T = any, R = any> = (data: T) => R | Promise<R>

export type BehaviorInputMap = {
  [eventName: string]: {
    _input: Record<string, any>
  }
}

export type MaybePromise<T> = T | Promise<T>

export type BehaviorEventMap<M extends BehaviorInputMap, MK extends keyof M = keyof M> = {
  [K in MK | `${MK & string}_cancel` | `${MK & string}_done`]:
  K extends `${MK & string}_cancel` ? (data: M[MK]['_input'], cancel: CancelFunction) => MaybePromise<void> :
  K extends `${MK & string}_done` ? (data: M[MK]['_input'], resp: any, cancelled: boolean) => MaybePromise<void> :
  (data: M[MK]['_input'], cancelled: boolean, cancelCount: number) => MaybePromise<void>
}


export type BehaviorCallFunction<M extends BehaviorInputMap> = <E extends keyof M, D = M[E]['_input'], DF extends D = D, R = void>(eventName: E, data: D, func?: BehaviorFunction<DF, R>, cancelFunc?: BehaviorFunction<DF, R>) => Promise<BehaviorResult<R>>

type BehaviorResult<R> = {
  data: R extends void ? void : R,
  cancelled: boolean,
}

export default (obj: CustomEventEmitter) => {
  const handleError = (err: Error, eventName: string, canContinue: boolean) => {
    // Log the error but don't crash
    if (err.name === 'UserError') {
      obj.emit('error', err, 'behavior')
    } else {
      const error = new Error(`Error in ${eventName} handler: ${err.message}`)
      error.stack = err.stack
      if (canContinue) {
        obj.emit('error', error, 'behavior')
      } else {
        throw error
      }
    }
  }

  const behavior = async <D = any, DF extends D = D, R = void> (eventName: string, data: D, func: BehaviorFunction<DF> = () => { }, cancelFunc: BehaviorFunction<DF> = () => { }): Promise<BehaviorResult<R>> => {
    let hideEventCancel = false
    let cancelled = false
    let cancelCount = 0
    let defaultCancel = true
    const cancel: CancelFunction = (dC = true, hidden = false) => { // Hidden shouldn't be used often but it's not hard to implement so meh
      if (hidden) hideEventCancel = true
      else {
        cancelled = true
        cancelCount++
      }
      defaultCancel = dC
    }

    let resp

    // Handle each event emission separately to allow pipeline to continue
    // PRE EVENT
    try {
      await obj.emitThen(eventName + '_cancel', data, cancel)
    } catch (err) {
      handleError(err, eventName + '_cancel', false)
    }

    // MAIN EVENT
    try {
      await obj.emitThen(eventName, data, cancelled, cancelCount)
    } catch (err) {
      handleError(err, eventName, false)
    }

    if (!hideEventCancel && !cancelled) {
      // NOT CANCELLED, DEFAULT BEHAVIOR
      try {
        resp = func(data as DF)
        if (resp instanceof Promise) {
          resp = await resp
        }
        if (typeof resp === 'undefined') resp = true
      } catch (err) {
        handleError(err, `${eventName} function`, false)
        // resp = false
      }
    } else if (cancelFunc && defaultCancel) {
      // CANCELLED, DEFAULT BEHAVIOR
      try {
        resp = cancelFunc(data as DF)
        if (resp instanceof Promise) {
          resp = await resp
        }
        if (typeof resp === 'undefined') resp = false
      } catch (err) {
        handleError(err, `${eventName} cancel function`, false)
        // resp = false
      }
    }

    // POST EVENT
    try {
      await obj.emitThen(eventName + '_done', data, resp, cancelled)
    } catch (err) {
      handleError(err, eventName + '_done', true)
    }

    return {
      data: resp,
      cancelled
    }
  }

  return behavior
}
