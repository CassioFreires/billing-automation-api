export async function retry<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;
    delayMs?: number;
    factor?: number;
    onRetry?: (err: any, attempt: number) => void;
  }
): Promise<T> {
  const retries = options?.retries ?? 10;
  const delayMs = options?.delayMs ?? 2000;
  const factor = options?.factor ?? 1.5;

  let lastError: any;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      options?.onRetry?.(err, attempt);

      // Não dorme após a ÚLTIMA tentativa — lança imediatamente.
      if (attempt < retries) {
        const delay = delayMs * Math.pow(factor, attempt - 1);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  throw lastError;
}