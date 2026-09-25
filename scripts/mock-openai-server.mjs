// A tiny fake OpenAI-compatible server for testing the "Other" AI option without a key.
// Run:  npm run mock-model          (listens on http://localhost:8787)
// Then in the app: AI settings → "Use an online AI instead" → Other,
//   Base URL http://localhost:8787/v1, key "test" (anything works), model "mock-model".
// It streams canned designer replies and pulls a few obvious facts out for the memory step.
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);

function clerk(userText) {
  const ops = [];
  const called = userText.match(/called ([A-Z][\w' ]+?)(?:[.!,]|$)/);
  if (called) ops.push({ type: "create_item", ref: "new:1", kind: "concept", slot: "title", title: called[1].trim(), summary: "", status: "confirmed", origin: "user_stated", evidence: called[0].replace(/[.!,]$/, "") });
  const no = userText.match(/I don't want ([\w -]+?)(?:[.!,]|$)/i);
  if (no) ops.push({ type: "create_item", ref: "new:2", kind: "mechanic", title: no[1].trim().replace(/^\w/, (c) => c.toUpperCase()), summary: "", status: "rejected", origin: "user_stated", evidence: no[0].replace(/[.!,]$/, "") });
  ops.push({ type: "add_question", question: `How does ${called ? called[1].trim() : "the game"} teach its core mechanic in the first five minutes?`, origin: "ai_suggested" });
  ops.push({ type: "create_item", ref: "new:3", kind: "mechanic", title: "Grapple tail", summary: "Swing from branches with your tail.", status: "proposed", origin: "ai_suggested" });
  return JSON.stringify({ ops });
}

function reply(userText) {
  return `Here's a first read on that.\n\n**What's working:** the idea has a clear hook.\n\n**Watch out:** "${userText.slice(0, 60)}" leaves the core loop undefined.\n\nTwo directions:\n\n- **A) Tight arena fights** with short levels.\n- **B) Connected world** with backtracking.\n\nWhich feels closer to your game?`;
}

http
  .createServer(async (req, res) => {
    // The app calls this straight from the browser, so allow cross-origin requests.
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method === "GET" && req.url.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: "mock-model", object: "model" }] }));
      return;
    }
    if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    const last = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    let text;
    if (system.startsWith("You are the Memory Clerk") || system.startsWith("You record game design decisions")) {
      const user = last.split("USER MESSAGE\n")[1]?.split("\n\nNEW ASSISTANT REPLY")[0] ?? "";
      text = clerk(user);
    } else if (system.includes("senior systems designer")) {
      text = JSON.stringify({ whatChanged: "Mock change.", systemsAffected: [{ name: "Combat", impact: "Mock impact." }], problems: ["Mock problem."], opportunities: [], tests: ["Mock test."] });
    } else {
      text = reply(last);
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const words = text.match(/\S+\s*/g) ?? [text];
    for (const w of words) {
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: body.model, choices: [{ index: 0, delta: { content: w }, finish_reason: null }] })}\n\n`);
      await new Promise((r) => setTimeout(r, 8));
    }
    res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  })
  .listen(PORT, () => console.log(`mock OpenAI server on http://localhost:${PORT}/v1`));
