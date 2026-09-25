// Renders web/icons/icon.svg to the PNG sizes the app needs (run once after changing the icon).
//   node scripts/render-icons.cjs   (needs Playwright; writes web/icons/*.png and desktop/icon.ico)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (svgFile, size, out) => {
    const svg = fs.readFileSync(svgFile, 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: out, omitBackground: true });
  };
  for (const s of [16, 24, 32, 48, 64, 128, 180, 192, 256, 512]) await shot('web/icons/icon.svg', s, `web/icons/icon-${s}.png`);
  for (const s of [192, 512]) await shot('web/icons/icon-maskable.svg', s, `web/icons/icon-maskable-${s}.png`);
  await browser.close();
  fs.mkdirSync('desktop', { recursive: true });
  execFileSync('python3', ['-c', `from PIL import Image
ims=[Image.open(f'web/icons/icon-{s}.png') for s in (256,128,64,48,32,24,16)]
ims[0].save('desktop/icon.ico', sizes=[(i.width,i.height) for i in ims], append_images=ims[1:])`]);
  console.log('icons written');
})();
