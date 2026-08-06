function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Führt `fn` mit exponentiellem Backoff erneut aus, statt einen
 * fehlgeschlagenen Versuch sofort und stillschweigend zu verwerfen.
 * `baseDelayMs` verdoppelt sich nach jedem Fehlversuch.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < attempts - 1) {
        await delay(baseDelayMs * 2 ** attempt);
      }
    }
  }

  throw lastError;
}
