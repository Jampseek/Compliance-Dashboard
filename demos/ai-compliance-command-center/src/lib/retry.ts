// Exponential backoff with additive jitter for transient external API failures.
// maxAttempts includes the first try (maxAttempts=2 means one retry).
//
// Non-retryable 4xx errors indicate a client-side problem that won't resolve by
// waiting (bad auth, malformed request). We classify these by the error's numeric
// `status` — NOT by string-matching the message, which produced false positives
// (e.g. an HTTPS port "443" or a stray number in a network-error message would be
// read as a 4xx and wrongly treated as fatal). 408 (timeout) and 429 (rate limit)
// are 4xx but transient, so they remain retryable. Everything else — 5xx and
// network errors with no status — is treated as transient.
function isNonRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 800 }: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (isNonRetryable(err)) throw err
      if (attempt < maxAttempts - 1) {
        // Exponential backoff (baseDelay * 2^attempt) plus up to 200ms of additive
        // jitter so simultaneous callers don't all retry at exactly the same moment.
        const delay = baseDelayMs * 2 ** attempt + Math.random() * 200
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
