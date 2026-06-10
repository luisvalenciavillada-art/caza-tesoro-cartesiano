/**
 * Capturas del juego en viewports de celular.
 * Uso: node scripts/mobile-preview.mjs
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'preview', 'mobile');

const DEVICES = [
  { name: 'iphone-14', width: 390, height: 844 },
  { name: 'android-360', width: 360, height: 740 }
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? '/index.html' : url;
  const fp = path.join(root, rel.replace(/^\//, ''));
  if (!fp.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('not found: ' + rel);
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
});

function startScene(page, key, data) {
  return page.evaluate(
    ({ key, data }) => {
      var g = window.__CTC_DEBUG_GAME__;
      if (data != null) g.scene.start(key, data);
      else g.scene.start(key);
    },
    { key, data }
  );
}

async function shot(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: false });
  console.log('  ->', path.relative(root, filePath));
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const dev of DEVICES) {
  console.log('\n' + dev.name + ' (' + dev.width + '×' + dev.height + ')');
  const page = await browser.newPage({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('PAGE: ' + e.message));

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  const ready = await page.evaluate(() => ({
    phaser: typeof Phaser !== 'undefined',
    game: !!window.__CTC_DEBUG_GAME__,
    canvas: !!document.querySelector('#phaser-game canvas'),
    diag: document.getElementById('boot-diagnostics')?.textContent?.slice(0, 200) || ''
  }));
  console.log('  boot:', JSON.stringify(ready));
  if (!ready.canvas) {
    console.log('  logs:', logs.slice(-8).join('\n'));
    continue;
  }

  const prefix = path.join(outDir, dev.name);

  await startScene(page, 'PreLevelScene', { levelIndex: 0 });
  await page.waitForTimeout(1500);
  await shot(page, prefix + '-nivel1-briefing.png');

  await startScene(page, 'GameScene', { levelIndex: 0 });
  await page.waitForTimeout(3000);
  await shot(page, prefix + '-nivel1-partida.png');

  await startScene(page, 'GameScene', { levelIndex: 1 });
  await page.waitForTimeout(3000);
  await shot(page, prefix + '-nivel2-partida.png');

  await page.close();
}

await browser.close();
server.close();
console.log('\nCapturas en: preview/mobile/');
