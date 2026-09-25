/**
 * Turns raw API errors into messages a beginner can act on.
 */
export function friendlyError(e: unknown, service: string): Error {
  const err = e as { status?: number; code?: string; message?: string; cause?: { code?: string } };
  const status = err?.status;
  const msg = err?.message ?? String(e);
  const code = err?.code ?? err?.cause?.code;
  if (err && (err as { name?: string }).name === "AbortError") return new Error("Stopped.");
  if (status === 401 || status === 403) return new Error(`${service} rejected the API key. Open AI settings and check you pasted the whole key.`);
  if (status === 404) return new Error(`${service} doesn't know that model name. Open AI settings and pick another model.`);
  if (status === 429) return new Error(`${service} says you've hit a limit (too many messages, or out of free quota/credit). Wait a minute and try again.`);
  if (status === 400 && /model/i.test(msg)) return new Error(`${service} couldn't use that model: ${msg}`);
  if (status && status >= 500) return new Error(`${service} is having trouble right now. Try again in a moment.`);
  if (code === "ECONNREFUSED" || /ECONNREFUSED|fetch failed|Connection error/i.test(msg)) {
    return new Error(`Couldn't reach ${service}. If you're using Ollama, make sure it's running; otherwise check your internet connection.`);
  }
  return new Error(`${service} error: ${msg}`);
}
