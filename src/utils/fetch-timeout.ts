/**
 * `fetch` com timeout via AbortController (spec 0054). Sem isto, um upstream lento
 * (WhatsApp Cloud, gateway) deixa a Promise pendurada para sempre — e, como o worker
 * é prefetch(1), UMA chamada travada congela a fila inteira. Sempre use isto para
 * chamadas externas.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
