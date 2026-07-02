// Exponential backoff with full jitter for transient external API failures.
// maxAttempts includes the first try (maxAttempts=2 means one retry).
// 4xx errors are not retried — they indicate a client-side problem that
// won't resolve by waiting (bad auth, malformed request, rate limit with no
// Retry-After). Only 5xx / network errors are considered transient.
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
      if (err instanceof Error && /\b4\d{2}\b/.test(err.message)) throw err
      if (attempt < maxAttempts - 1) {
        // Full jitter: spread retries across [0, baseDelay * 2^attempt + 200ms]
        // so simultaneous callers don't all retry at exactly the same moment.
        const delay = baseDelayMs * 2 ** attempt + Math.random() * 200
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
