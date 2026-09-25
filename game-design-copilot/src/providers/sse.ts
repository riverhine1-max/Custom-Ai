/** Reads a server-sent-events stream (used by the OpenAI-style and Claude APIs). */
export async function* readSse(res: Response): AsyncGenerator<{ event?: string; data: string }> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
      let event: string | undefined;
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}

/** An HTTP error carrying the status, so friendlyError() can explain it. */
export async function httpError(res: Response): Promise<Error & { status: number }> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? JSON.stringify(body).slice(0, 200);
  } catch {
    detail = res.statusText;
  }
  return Object.assign(new Error(detail || `HTTP ${res.status}`), { status: res.status });
}
