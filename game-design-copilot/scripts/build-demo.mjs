// Builds the hosted claude.ai demo: the shared UI + core bundled into one
// HTML file (demo/dist/copilot.html). React loads from cdnjs as a pinned UMD
// build; everything else is inlined.
//   npm run demo:build
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const outdir = "demo/dist";
fs.mkdirSync(outdir, { recursive: true });

// Map "react" and "react-dom/client" to the UMD globals loaded from the CDN.
const reactGlobals = {
  name: "react-globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom(\/client)?)?$/ }, (a) => ({ path: a.path, namespace: "globals" }));
    b.onLoad({ filter: /.*/, namespace: "globals" }, (a) => ({
      contents: a.path === "react" ? "module.exports = window.React;" : "module.exports = window.ReactDOM;",
      loader: "js",
    }));
  },
};

const result = await build({
  entryPoints: ["demo/main.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  // Classic JSX (React.createElement) so the UMD React global is used. The
  // tsconfig says "react-jsx" (React 19, used by the web app), so override it here.
  tsconfigRaw: { compilerOptions: { jsx: "react", jsxFactory: "React.createElement", jsxFragmentFactory: "React.Fragment" } },
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [reactGlobals],
  outdir,
  write: false,
  legalComments: "none",
  logLevel: "warning",
});

const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
const safeJs = js.replace(/<\/script/gi, "<\\/script");

const html = `<title>Game Design Copilot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
${css}
html, body { height: 100%; }
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${safeJs}
</script>
`;

const file = path.join(outdir, "copilot.html");
fs.writeFileSync(file, html);
console.log(`wrote ${file} (${(html.length / 1024).toFixed(0)} KB)`);
