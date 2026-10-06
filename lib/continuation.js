/** Bound ritual host calls even when a service ignores its cancellation signal. */
export async function continuationProbePre(probe, timeoutMs) {
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => probe(controller.signal)),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('continuation probe timed out'))
        }, Math.max(1, timeoutMs))
      }),
    ])
  } finally { clearTimeout(timer) }
}

/** A ritual is complete only when the turn consuming this request has ended. */
export function continuationRitualEndPre(events, requestId, baseSeq) {
  let turn = null
  let matched = null
  for (const ev of Array.isArray(events) ? events : []) {
    if (!(Number(ev && ev.seq) > baseSeq)) continue
    if (ev.type === 'turn/start') turn = ev.data && ev.data.turn
    if (ev.type === 'user/message') {
      const message = ev.data && ev.data.message ? ev.data.message : ev.data
      if (message && message.source && message.source.rpcId === requestId) matched = turn
    }
    if (ev.type === 'turn/end' && matched != null && ev.data && ev.data.turn === matched) {
      return (ev.data.reason && ev.data.reason.kind) || 'unknown'
    }
  }
  return ''
}
