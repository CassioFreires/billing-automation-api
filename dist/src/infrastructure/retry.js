export async function retry(fn, options) {
    const retries = options?.retries ?? 10;
    const delayMs = options?.delayMs ?? 2000;
    const factor = options?.factor ?? 1.5;
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            options?.onRetry?.(err, attempt);
            const delay = delayMs * Math.pow(factor, attempt - 1);
            await new Promise(res => setTimeout(res, delay));
        }
    }
    throw lastError;
}
