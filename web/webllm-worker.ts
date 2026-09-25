/**
 * Runs the built-in AI model in a background thread, so the page stays
 * responsive while the model thinks. Loaded by src/providers/builtin/webllm.ts.
 */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
