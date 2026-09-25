// Builds the web app into dist/ (plain files you can put on any web host).
//   npm run build     → dist/, minified
//   npm run dev       → build, watch for changes, serve at http://localhost:3000
//   npm run preview   → build once, minified, and serve
import { build, context } from "esbuild";
import fs from "node:fs";

const args = new Set(process.argv.slice(2));
const serve = args.has("--serve");
const once = args.has("--once");
const dev = serve && !once;
const outdir = "dist";

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });
fs.copyFileSync("web/index.html", `${outdir}/index.html`);

const options = {
  entryPoints: { main: "web/main.tsx", "webllm-worker": "web/webllm-worker.ts" },
  bundle: true,
  format: "esm",
  splitting: true, // the big AI library loads only when the built-in AI is first used
  outdir,
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  minify: !dev,
  sourcemap: dev,
  target: ["es2022"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  legalComments: "none",
  logLevel: "info",
};

if (serve) {
  const ctx = await context(options);
  if (!once) await ctx.watch();
  let result;
  for (const port of [3000, 3001, 3002, 0]) {
    try {
      result = await ctx.serve({ servedir: outdir, port, host: "localhost" });
      break;
    } catch {
      /* port in use, try the next one */
    }
  }
  console.log(`\n  Game Design Copilot is running: http://localhost:${result.port}\n  (Press Ctrl+C to stop.)\n`);
} else {
  await build(options);
  const size = fs.readdirSync(outdir, { recursive: true }).length;
  console.log(`Built ${size} files into ${outdir}/. Upload that folder to any static web host.`);
}
