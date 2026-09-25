# Game Design Copilot

A friendly AI game designer for solo developers and beginners. Describe your idea; it asks
simple questions, gives honest feedback, keeps notes of what you decide (and why), and
tells you what a change affects. **Nothing the AI suggests counts until you say yes.**

**It's free and works on its own.** The AI runs inside your web browser, on your own
device. There's no account, no sign-in, no API key and no subscription. Your games are
saved in your browser too, so nothing leaves your computer.

This is V1. It covers projects, design chat with seven modes, structured memory, the design
document, guided design (12 playbooks), design critique, design consequences, open
questions, rejected ideas and decision history.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer (only to build it; the app itself is
plain web files).

```bash
npm install
npm run dev          # then open http://localhost:3000
```

Type your game idea and press **Start designing**. That's it.

The first time, the built-in AI downloads once (about 1.2 GB for the recommended size,
with a progress bar). After that it starts in a few seconds and works offline.

### What you need for the built-in AI

A browser that supports **WebGPU** (it lets web pages use your graphics chip):

- **Chrome or Edge** 113 or newer, on Windows, Mac or ChromeOS (also Chrome on many
  Android phones)
- **Safari** on macOS 26 or iOS 26
- **Firefox** 141 or newer on Windows

If your browser has Google's own built-in AI switched on and ready, the app uses that
instead and skips the download.

Pick a size in **AI settings** (bottom-left):

| Size | Download | Graphics memory it needs | Good for |
| --- | --- | --- | --- |
| Light | about 0.5 GB | about 1.6 GB | older computers and phones |
| **Balanced** (default) | about 1.2 GB | about 2.2 GB | most laptops |
| Smart | about 2.3 GB | about 3.9 GB | newer computers with a good graphics chip |

**Remove download** in the same screen frees the space again.

Be honest with yourself about what to expect: a model small enough to run in a browser gives
shorter, simpler answers than big online AIs like ChatGPT or Claude. It's good for thinking
out loud, keeping notes and quick feedback. If your device can't run it, the app tells you
and shows other choices.

### Optional: use an online AI instead

In **AI settings → Use an online AI instead** you can switch to a bigger model. These need
an account and a key; the app calls them straight from your browser and keeps your key
only in this browser.

| Option | Cost | What you need |
| --- | --- | --- |
| **Google Gemini** | Free tier | A free key from [Google AI Studio](https://aistudio.google.com/apikey). On the free tier Google may use what you send to improve its products. |
| **On your computer (Ollama)** | Free and private | [Install Ollama](https://ollama.com/download), run `ollama pull <model>`, then press "Find my models". If the app is hosted on a website (not localhost), start Ollama with `OLLAMA_ORIGINS` set to that site's address. |
| **ChatGPT (OpenAI)** | Pay per use | An [OpenAI API key](https://platform.openai.com/api-keys). A ChatGPT Plus subscription doesn't include the API. |
| **Claude (Anthropic)** | Pay per use | An [Anthropic API key](https://platform.claude.com/settings/keys). |
| **Other** | Varies | Any OpenAI-compatible service (OpenRouter, Groq, LM Studio): base URL, key, model. |

Press **Test**, then **Save**. You can switch any time; your games and notes stay the same.

**Try the online path with a fake AI:** `npm run mock-model` starts one on your computer. In
AI settings choose **Other**, base URL `http://localhost:8787/v1`, key `test`, model
`mock-model`.

---

## Put it online so anyone can use it (free)

`npm run build` makes a `dist/` folder of plain files. Upload that folder to any free
static host and share the link. Each visitor gets their own AI and their own saved games in
their own browser; you don't pay for anything they do.

**GitHub Pages:** push this project to GitHub, run `npm run build`, and publish the
`dist/` folder (for example with the
[upload-pages-artifact](https://github.com/actions/upload-pages-artifact) action, or by
copying `dist/` into a `gh-pages` branch). Netlify, Cloudflare Pages and Vercel also work:
the build command is `npm run build` and the output folder is `dist`.

The site must be served over **https** (all of these do that for you), because browsers
only allow WebGPU on secure pages. `localhost` counts as secure.

`npm run preview` builds the minified version and serves it locally, so you can check it
before uploading.

---

## Your games and backups

Games are saved in your browser (IndexedDB). They stay after you close the tab, but
clearing your browser's site data deletes them, and they don't sync between devices.

- **Export game** (sidebar) downloads a `.json` backup of the open game, including chat.
- **Import** loads a backup. If that game already exists, you get a copy next to it.

Use export/import to move a game to another computer or browser.

---

## What's in the app

- **Chat** with your game designer. Pick how it helps from the menu in the message box:
  Chat, Shape my idea, Step by step, Honest feedback, Is it too big?, Compare options,
  Brainstorm.
- **Copy** any message, **edit** your last message, **regenerate** the last answer, stop a
  reply with **Esc**, jump to the latest message, light/dark switch, rename a game by
  clicking its name.
- **Notes**: everything decided about your game, things still to decide, past decisions,
  and ruled-out ideas. Edit anything directly.
- **Game plan**: your design document, written automatically from what you decided. Copy
  it or download it.
- **Summary** panel: the game at a glance.

The example game, **Acorn Ronin** (a squirrel samurai), shows every feature without using
the AI. Open it from the home screen.

---

## How it works, in one minute

Your notes are **structured data**, not chat history. Every fact about your game is a
*design item* with a status (the app shows the friendly name; the code uses the second):

- **Decided** (`confirmed`): you chose it.
- **Probably** (`likely`): implied by what you said, not confirmed.
- **Idea** (`proposed`): being considered.
- **Ruled out** (`rejected`): you said no. The designer won't suggest it again.

Each time you send a message:

1. **Designer reply.** The model answers using a persona, the mode you picked, and a
   written summary of your project's memory (the "brief").
2. **Memory clerk.** A second model call reads the exchange and proposes changes as JSON.
3. **Validation (code, not AI).** A change applies automatically only if it quotes *your*
   words from this message. AI ideas wait for your click, and even then are saved as
   *proposed*. Anything matching a rejected idea is blocked.
4. **Undo.** Every change is logged with before/after snapshots and can be undone.
5. **Design consequences.** If you changed how a decided mechanic works, a third call
   explains what else it affects. It never undoes your decision.

The design document is generated from decided memory. The AI never writes it.

**Small models get smaller prompts.** The built-in AI has room for about 4,000 tokens (roughly
3,000 words) per call, so it gets a shorter brief, the last few messages, and a compact
clerk prompt with one example. The sizes are in `SMALL_MODEL_BUDGET` in
`src/core/provider.ts`, and a test checks that even a full project fits.

---

## Where things live

```
web/                    ← the web app: page, startup (main.tsx), AI worker
src/
  core/                 ← all the design logic. No framework, no AI library. Start here.
    types.ts            ← the data model (read this first)
    validate.ts         ← the safety rules for AI-proposed changes
    memory.ts           ← applying changes, undo, manual edits, consequence triggers
    brief.ts            ← the memory summary the model reads every turn
    service.ts          ← one conversation turn, end to end (CopilotService)
    provider.ts         ← the ModelProvider interface and prompt size budgets
    designDoc.ts        ← renders the design document
    example.ts          ← the Acorn Ronin example project
    prompts/            ← persona, modes, playbooks, clerk, consequences
  providers/
    builtin/            ← the free built-in AI: Chrome's AI, or WebLLM on WebGPU
    openai.ts           ← OpenAI-style APIs (ChatGPT, Gemini, Ollama, Other)
    anthropic.ts        ← Claude
    presets.ts          ← the choices on the AI settings screen
  stores/               ← where games are saved: IndexedDB, claude.ai database, in memory
  ui/                   ← the React screens (shared by the web app and the demo)
demo/                   ← the hosted claude.ai version (same UI + core)
tests/                  ← unit tests, scripted design sessions, real-model fixtures
scripts/                ← web and demo builds, fake model server, clerk prompt checks
```

The core only talks to two small interfaces: `ModelProvider` (`core/provider.ts`) and
`ProjectStore` (`core/store.ts`). That's why the same code runs in the web app, the
hosted demo and the tests, and why swapping the AI or the storage never touches the design
logic.

**How the built-in AI loads** (`src/providers/builtin/index.ts`): first it checks for
Chrome's built-in AI. If that isn't ready, it checks for WebGPU, then loads the chosen
model with [WebLLM](https://github.com/mlc-ai/web-llm) in a background worker
(`web/webllm-worker.ts`) so the page stays smooth. The WebLLM library (about 6 MB) is only
downloaded the first time you use the built-in AI. The model files come from Hugging Face
and are cached by the browser.

---

## Common changes

**Tune how the copilot talks.** Edit `src/core/prompts/persona.ts`. Change one thing at a
time, then try the same conversation again.

**Add a mode.** Add an entry to `MODES` in `src/core/prompts/modes.ts` and its id to
`ModeId` in `src/core/types.ts`. The mode picker updates itself.

**Add a Design Coach playbook** (e.g. "stealth system"). Add an entry to `PLAYBOOKS` in
`src/core/prompts/playbooks.ts`. Nothing else changes.

**Change the built-in model sizes.** Edit `BUILTIN_MODELS` in
`src/providers/builtin/models.ts`. The model names must match WebLLM's list of prebuilt
models.

**Add an online AI option.** If it has an OpenAI-style API, add an entry to `PRESETS` in
`src/providers/presets.ts` and a case in `providerFromConfig()` in `src/providers/index.ts`.
Otherwise write a class with a `generate()` method (copy `src/providers/openai.ts`).

**Change what saves automatically.** The rules are in `routeOps()` and `trust()` in
`src/core/validate.ts`, with tests in `tests/validate.test.ts`. Change the test first, then
the rule.

**Ask before saving anything.** Turn on "Ask me before saving anything from the chat" at
the bottom of Notes → Your game. Nothing then saves without a click.

---

## Tests and prompt checks

```bash
npm test            # 64 tests: safety rules, memory, saving, built-in AI, full scripted sessions
npm run typecheck
```

`tests/scenarios.test.ts` plays whole design sessions from the spec with a scripted model:
a vague pitch, rejecting wall running, changing the rifle's energy system, undo, and
failures. It's the best way to see the pipeline work. `tests/builtin.test.ts` covers the
built-in AI's setup steps and checks every prompt fits a small model.

**Checking the clerk prompt with a real model:**

```bash
npm run eval:cases -- cases.json      # writes the exact prompts for 6 tricky cases
# run each prompt through your model, save {"case-id": "<raw reply>", ...} as answers.json
npm run eval:check -- answers.json    # shows what validation does with each answer
```

`tests/fixtures/clerk-answers.json` holds one model's answers and runs as a test. Doing the
same with the built-in model is the best next step for tuning the compact clerk prompt.

---

## Hosted demo on claude.ai

`npm run demo:build` bundles the same UI and core into `demo/dist/copilot.html`, which
runs as a claude.ai page using the viewer's Claude account. That page can't download the
built-in AI (claude.ai pages can't fetch model files), so it only uses Claude. For the
no-account version, run the app yourself or host `dist/` as described above.

---

## What's next

See the V1 architecture and build plan document for the staged roadmap: tuning prompts
with real sessions (especially on the built-in model), a roadmap generator, the visual
design graph, screenshot analysis, search when projects get large, then playtest analysis
and specialist agents.
