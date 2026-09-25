/** The free built-in AI, the online adapters, and small-model prompts. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuiltInProvider, stripThinking, UNSUPPORTED_MESSAGE, webllmId } from "../src/providers/builtin";
import { providerFromConfig, viewOf } from "../src/providers";
import { OpenAIProvider } from "../src/providers/openai";
import { AnthropicProvider } from "../src/providers/anthropic";
import { CopilotService, MemoryStore, SMALL_MODEL_BUDGET, type GenerateRequest } from "../src/core";
import { deterministic } from "./helpers";

deterministic();

type Hook = { __GDC_TEST_ENGINE__?: { generate(r: GenerateRequest): Promise<string> } };
afterEach(() => {
  delete (globalThis as Hook).__GDC_TEST_ENGINE__;
  vi.unstubAllGlobals();
});

describe("built-in AI", () => {
  it("is the default choice and asks for small-model prompts", () => {
    const p = providerFromConfig({ provider: "builtin" });
    expect(p).toBeInstanceOf(BuiltInProvider);
    expect(p.budget).toEqual(SMALL_MODEL_BUDGET);
    expect(viewOf({ provider: "builtin", size: "smart" }).label).toBe("Ludomuse · Smart");
  });

  it("explains clearly when the browser can't run it", async () => {
    const p = new BuiltInProvider({ size: "balanced", workerUrl: null });
    const seen: string[] = [];
    p.subscribe((s) => seen.push(s.phase));
    await expect(p.generate({ purpose: "reply", system: "", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(UNSUPPORTED_MESSAGE);
    expect(seen).toEqual(["idle", "checking", "unsupported"]);
  });

  it("uses Chrome's built-in AI when it's ready, streaming deltas or whole-text chunks", async () => {
    const created: unknown[] = [];
    vi.stubGlobal("LanguageModel", {
      availability: async () => "available",
      create: async (opts: unknown) => {
        created.push(opts);
        return {
          async *promptStreaming() {
            yield "Hello";
            yield "Hello there";
            yield "!";
          },
          destroy() {},
        };
      },
    });
    const p = new BuiltInProvider({ size: "balanced", workerUrl: null });
    const texts: string[] = [];
    const out = await p.generate({ purpose: "reply", system: "sys", messages: [{ role: "user", content: "hi" }], onText: (t) => texts.push(t) });
    expect(out).toBe("Hello there!");
    expect(p.status).toMatchObject({ phase: "ready", engine: "chrome" });
    expect((created[0] as { initialPrompts: { role: string }[] }).initialPrompts[0].role).toBe("system");
  });

  it("can be swapped for a test engine", async () => {
    (globalThis as Hook).__GDC_TEST_ENGINE__ = { generate: async () => "from test" };
    const p = new BuiltInProvider({ size: "light", workerUrl: null });
    expect(await p.generate({ purpose: "reply", system: "", messages: [{ role: "user", content: "x" }] })).toBe("from test");
  });

  it("restarts by itself when the graphics chip drops the model", async () => {
    let calls = 0;
    (globalThis as Hook).__GDC_TEST_ENGINE__ = {
      generate: async () => {
        calls++;
        if (calls === 1) {
          const e = new Error("Model not loaded before trying to complete ChatCompletionRequest.");
          e.name = "ModelNotLoadedError";
          throw e;
        }
        return "back again";
      },
    };
    const p = new BuiltInProvider({ size: "balanced", workerUrl: null });
    const phases: string[] = [];
    p.subscribe((s) => phases.push(s.phase));
    expect(await p.generate({ purpose: "reply", system: "", messages: [{ role: "user", content: "x" }] })).toBe("back again");
    expect(calls).toBe(2);
    expect(phases).toContain("loading");
  });

  it("explains in plain words and suggests Light when it keeps running out of graphics memory", async () => {
    (globalThis as Hook).__GDC_TEST_ENGINE__ = {
      generate: async () => {
        throw new Error("Ludomuse had a problem: ModelNotLoadedError: Model not loaded before trying to complete ChatCompletionRequest.");
      },
    };
    const p = new BuiltInProvider({ size: "balanced", workerUrl: null });
    const err = await p.generate({ purpose: "reply", system: "", messages: [{ role: "user", content: "x" }] }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/ran out of graphics memory/);
    expect((err as Error).message).toMatch(/choose Light/);
    expect((err as Error).message).not.toMatch(/MLCEngine/);
    expect(p.status.phase).toBe("error");
  });

  it("hides the model's private thinking", () => {
    expect(stripThinking("<think>hmm</think>\n\nAnswer")).toBe("Answer");
    expect(stripThinking("Partial <think>still thinking")).toBe("Partial ");
    expect(stripThinking("<think>")).toBe("");
  });

  it("picks the 32-bit build for graphics chips without 16-bit float support", () => {
    expect(webllmId("balanced", true)).toBe("Qwen3.5-2B-q4f16_1-MLC");
    expect(webllmId("smart", false)).toBe("Qwen3.5-4B-q4f32_1-MLC");
  });
});

describe("small models get small prompts", () => {
  it("sends less history, a smaller brief and the compact memory prompt", async () => {
    const calls: GenerateRequest[] = [];
    const small = { name: "small", budget: SMALL_MODEL_BUDGET, generate: async (r: GenerateRequest) => { calls.push(r); return r.purpose === "clerk" ? '{"ops":[]}' : "ok"; } };
    const svc = new CopilotService(new MemoryStore(), small);
    const p = await svc.createProject("x");
    for (let i = 0; i < 6; i++) await svc.sendMessage(p.id, { text: `message ${i}`, mode: "chat" });
    const lastReply = calls.filter((c) => c.purpose === "reply").at(-1)!;
    expect(lastReply.messages.length).toBe(5); // 4 earlier + the new one
    expect(lastReply.maxTokens).toBe(SMALL_MODEL_BUDGET.replyTokens);
    // everything the model reads fits a 4,096-token window (roughly 4 characters per token)
    const chars = lastReply.system.length + lastReply.messages.reduce((n, m) => n + m.content.length, 0);
    expect(chars / 4 + SMALL_MODEL_BUDGET.replyTokens).toBeLessThan(4096);
    const clerk = calls.filter((c) => c.purpose === "clerk").at(-1)!;
    expect(clerk.system).toMatch(/^You record game design decisions/);
    expect(clerk.system.length).toBeLessThan(3000);
  });
});

function sseResponse(events: string[]): Response {
  const body = new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(e));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("online AIs called from the browser", () => {
  it("streams an OpenAI-style answer", async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n',
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const p = new OpenAIProvider({ apiKey: "k", model: "gpt-6-luna", label: "OpenAI", openaiNative: true });
    const seen: string[] = [];
    expect(await p.generate({ purpose: "reply", system: "s", messages: [{ role: "user", content: "hi" }], onText: (t) => seen.push(t) })).toBe("Hello");
    expect(seen).toEqual(["Hel", "Hello"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-6-luna", stream: true, max_completion_tokens: 6000 });
  });

  it("explains a rejected key in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })));
    const p = new OpenAIProvider({ apiKey: "k", baseURL: "https://x/v1", model: "m", label: "Google Gemini" });
    await expect(p.generate({ purpose: "reply", system: "", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/Google Gemini rejected the API key/);
  });

  it("streams a Claude answer with the browser-access header", async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const p = new AnthropicProvider({ apiKey: "k", model: "claude-sonnet-5" });
    expect(await p.generate({ purpose: "reply", system: "s", messages: [{ role: "user", content: "hi" }] })).toBe("Hi there");
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("falls back to a helpful message when an online AI has no key", async () => {
    const p = providerFromConfig({ provider: "openai" });
    expect(await p.generate({ purpose: "reply", system: "", messages: [{ role: "user", content: "hi" }] })).toMatch(/Ludomuse/);
  });
});

describe("backups", () => {
  it("exports a game and imports it again as a copy", async () => {
    const store = new MemoryStore();
    const svc = new CopilotService(store, { name: "x", generate: async () => "{}" });
    const ex = await svc.loadExample();
    const data = await svc.exportProject(ex.id);
    const json = JSON.parse(JSON.stringify(data));
    const copy = await svc.importProject(json);
    expect(copy.id).not.toBe(ex.id);
    expect(copy.name).toMatch(/\(copy\)$/);
    const ws = await svc.getWorkspace(copy.id);
    expect(ws.messages.length).toBe(11);
    expect(ws.messages.every((m) => m.projectId === copy.id)).toBe(true);
    await expect(svc.importProject({ hello: "world" })).rejects.toThrow(/isn't a Game Design Copilot backup/);
  });
});

describe("worst case for the small model", () => {
  it("still fits a 4,096-token window with a full project and long replies", async () => {
    const calls: GenerateRequest[] = [];
    const long = "This is a long and detailed design reply. ".repeat(80); // ~3,400 characters
    const small = { name: "small", budget: SMALL_MODEL_BUDGET, generate: async (r: GenerateRequest) => { calls.push(r); return r.purpose === "clerk" ? '{"ops":[]}' : long; } };
    const svc = new CopilotService(new MemoryStore(), small);
    const ex = await svc.loadExample();
    for (let i = 0; i < 5; i++) await svc.sendMessage(ex.id, { text: "Tell me more about the rifle and the sword and how they fit the pillars. ".repeat(3), mode: "coach", topic: "combat" });
    for (const c of calls) {
      const chars = c.system.length + c.messages.reduce((n, m) => n + m.content.length, 0);
      expect(chars / 3.5 + (c.maxTokens ?? 0), `${c.purpose} call`).toBeLessThan(4096);
    }
  });
});
