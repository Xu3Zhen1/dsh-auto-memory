import { DEGRADE_REASON_MAX_PRE_V1 } from './degrade.js'

// Error messages can contain credentials, URLs, paths, source text or injected
// instructions. Keep only allowlisted identifiers; never persist message/stack
// or stringify an arbitrary thrown value. Unknown identifiers are omitted.
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AggregateError'])
const ERROR_CODES = new Set([
  'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EIO', 'EINVAL', 'EBUSY', 'EMFILE', 'ENFILE',
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ERR_BUFFER_TOO_LARGE', 'ERR_OUT_OF_RANGE',
  'SESSION_QUERY_PERSISTENCE_FAILED',
])

export function diagnosticErrorReasonPre(error) {
  let name = 'unknown', code = ''
  try { const value = error && error.name; if (ERROR_NAMES.has(value)) name = value } catch (_) {}
  try { const value = error && error.code; if (ERROR_CODES.has(value)) code = value } catch (_) {}
  // Some hosts expose their stable code only in message. Copy the identifier,
  // never its surrounding content. Avoid arbitrary coercion and unbounded scans.
  if (!code) {
    try {
      const message = error && error.message
      if (typeof message === 'string') {
        const tokens = message.slice(0, 2048).match(/\b[A-Z][A-Z0-9_]+\b/g) || []
        code = tokens.find((token) => ERROR_CODES.has(token)) || ''
      }
    } catch (_) {}
  }
  return ('type=' + name + (code ? '; code=' + code : '') + '; message=[redacted]').slice(0, DEGRADE_REASON_MAX_PRE_V1)
}

/** Respect the real sink's record(kind, reason) API, including hostile sinks. */
export function recordDiagnosticErrorPre(sink, kind, error) {
  try {
    if (!sink || typeof sink.record !== 'function') return
    const result = sink.record(kind, diagnosticErrorReasonPre(error))
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch (_) { /* Observability must never mask the original failure. */ }
}
