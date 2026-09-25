// Builds the Windows desktop app: release/Game-Design-Copilot-Windows.zip
//   npm run desktop:win
// Steps: build the web app, take the official Electron runtime for Windows,
// put the app inside it, give the .exe our name and icon, and zip it.
// Unzip on Windows and double-click "Game Design Copilot.exe". Nothing to install.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as ResEdit from "resedit";
import * as PE from "pe-library";

const ELECTRON = process.env.ELECTRON_VERSION || "44.4.5";
const PLATFORM = process.env.DESKTOP_PLATFORM || "win32-x64"; // linux-x64 is used for testing
const NAME = "Game Design Copilot";
const VERSION = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const cache = ".cache";
const zipName = `electron-v${ELECTRON}-${PLATFORM}.zip`;
const runtime = path.join(cache, zipName);
const out = path.join("release", `${NAME}-${PLATFORM}`);

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

// 1. The web app.
run("node", ["scripts/build-web.mjs"]);

// 2. The Electron runtime (downloaded once, then reused).
fs.mkdirSync(cache, { recursive: true });
if (!fs.existsSync(runtime)) {
  console.log(`Downloading Electron ${ELECTRON} for ${PLATFORM}…`);
  run("curl", ["-fSL", "-o", runtime, `https://github.com/electron/electron/releases/download/v${ELECTRON}/${zipName}`]);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
run("unzip", ["-q", runtime, "-d", out]);

// 3. Our app inside it.
const resources = path.join(out, "resources");
fs.rmSync(path.join(resources, "default_app.asar"), { force: true });
const appDir = path.join(resources, "app");
fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync("desktop/main.cjs", path.join(appDir, "main.cjs"));
fs.copyFileSync("desktop/icon.png", path.join(appDir, "icon.png"));
fs.cpSync("dist", path.join(appDir, "web"), { recursive: true });
fs.rmSync(path.join(appDir, "web", "sw.js"), { force: true }); // the desktop app has its files locally
fs.writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify({ name: "game-design-copilot", productName: NAME, version: VERSION, main: "main.cjs", description: "Game design copilot with Ludomuse" }, null, 2),
);

// 4. Name and icon.
if (PLATFORM.startsWith("win32")) {
  const exePath = path.join(out, `${NAME}.exe`);
  fs.renameSync(path.join(out, "electron.exe"), exePath);
  const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(fs.readFileSync("desktop/icon.ico"));
  for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icon.icons.map((i) => i.data));
  }
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (vi) {
    const [maj, min, pat] = VERSION.split(".").map(Number);
    vi.setFileVersion(maj, min, pat, 0, 1033);
    vi.setProductVersion(maj, min, pat, 0, 1033);
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      { ProductName: NAME, FileDescription: NAME, InternalName: NAME, OriginalFilename: `${NAME}.exe`, CompanyName: "River Hine", LegalCopyright: "© 2026 River Hine" },
    );
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
} else if (PLATFORM.startsWith("linux")) {
  fs.renameSync(path.join(out, "electron"), path.join(out, "game-design-copilot"));
}

fs.writeFileSync(
  path.join(out, "READ ME FIRST.txt"),
  `${NAME} ${VERSION}\r\n\r\nDouble-click "${NAME}.exe" to start. There's nothing to install.\r\n\r\nWindows may say it "protected your PC" because this app isn't signed by a big company.\r\nClick "More info", then "Run anyway".\r\n\r\nLudomuse, the free AI, downloads once (about 1.2 GB) the first time you use it.\r\nYour games are saved on this computer.\r\n`,
);

// 5. Zip it.
const zipOut = path.resolve("release", `Game-Design-Copilot-${PLATFORM === "win32-x64" ? "Windows" : PLATFORM}.zip`);
fs.rmSync(zipOut, { force: true });
run("zip", ["-qry", zipOut, path.basename(out)], { cwd: "release" });
console.log(`\nDesktop app: ${path.relative(process.cwd(), zipOut)} (${(fs.statSync(zipOut).size / 1e6).toFixed(0)} MB)`);
