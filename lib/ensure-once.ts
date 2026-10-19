const inflight = new Map<string, Promise<void>>()

/** Run schema/bootstrap work once per serverless instance instead of on every request. */
export function ensureOnce(key: string, run: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key)
  if (existing) return existing
  const next = run().catch((err) => {
    inflight.delete(key)
    throw err
  })
  inflight.set(key, next)
  return next
}

export async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    return await run()
  } finally {
    console.info(`[perf] ${label} ${Date.now() - started}ms`)
  }
}
