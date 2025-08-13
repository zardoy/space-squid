export default (obj) => {
  const handleError = (err: Error, eventName: string) => {
    // Log the error but don't crash
    if (err.name === 'UserError') {
      obj.emit('error', err, 'behavior')
    } else {
      const error = new Error(`Error in ${eventName} handler: ${err.message}`)
      error.stack = err.stack
      obj.emit('error', error, 'behavior')
    }
    return false // Return false to indicate error occurred
  }

  return async (eventName: string, data?: any, func?: Function, cancelFunc?: Function) => {
    let hiddenCancelled = false
    let cancelled = false
    let cancelCount = 0
    let defaultCancel = true
    const cancel = (dC = true, hidden = false) => { // Hidden shouldn't be used often but it's not hard to implement so meh
      if (hidden) hiddenCancelled = true
      else {
        cancelled = true
        cancelCount++
      }
      defaultCancel = dC
    }

    let resp

    func = func || (() => { })

    // Handle each event emission separately to allow pipeline to continue
    try {
      await obj.emitThen(eventName + '_cancel', data, cancel)
    } catch (err) {
      handleError(err, eventName + '_cancel')
    }

    try {
      await obj.emitThen(eventName, data, cancelled, cancelCount)
    } catch (err) {
      handleError(err, eventName)
    }

    if (!hiddenCancelled && !cancelled) {
      try {
        resp = func(data)
        if (resp instanceof Promise) {
          resp = await resp
        }
        if (typeof resp === 'undefined') resp = true
      } catch (err) {
        handleError(err, `${eventName} function`)
        resp = false
      }
    } else if (cancelFunc && defaultCancel) {
      try {
        resp = cancelFunc(data)
        if (resp instanceof Promise) {
          resp = await resp
        }
        if (typeof resp === 'undefined') resp = false
      } catch (err) {
        handleError(err, `${eventName} cancel function`)
        resp = false
      }
    }

    try {
      await obj.emitThen(eventName + '_done', data, cancelled)
    } catch (err) {
      handleError(err, eventName + '_done')
    }

    return resp
  }
}
