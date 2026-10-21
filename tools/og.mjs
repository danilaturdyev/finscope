// Генерирует картинки для превью ссылок (1200x630): data/og/<ТИКЕР>.png.
// Запуск: node tools/og.mjs [ТИКЕР ...]   (нужны playwright-core и chromium; путь к chromium в CHROMIUM или /opt/pw-browsers/chromium)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/');
const { chromium } = require('playwright-core');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(fs.readFileSync(path.join(root, 'data/stocks.json'), 'utf8'));
const want = process.argv.slice(2).map(s => s.toUpperCase());
fs.mkdirSync(path.join(root, 'data/og'), { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
for (const x of reg) {
  if (want.length && !want.includes(x.t)) continue;
  const S = JSON.parse(fs.readFileSync(path.join(root, 'data', x.t + '.json'), 'utf8'));
  const logo = x.logo ? 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'data', x.logo)).toString('base64') : '';
  const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}body{width:1200px;height:630px;font-family:Manrope,Inter,"Segoe UI",Arial,sans-serif;color:#f5f7fb;background:radial-gradient(900px 500px at 15% 10%,#1d3a8a 0%,transparent 60%),radial-gradient(800px 500px at 100% 100%,#5b2aa8 0%,transparent 55%),#05060a;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
  .top{display:flex;align-items:center;gap:36px}.lg{width:190px;height:190px;border-radius:${x.logoShape === 'round' ? '50%' : '44px'};object-fit:cover;box-shadow:0 20px 60px rgba(77,148,255,.35)}
  h1{font-size:92px;letter-spacing:-.03em;line-height:1}.tk{font-size:36px;color:#b6c0d4;margin-top:14px}
  .v{font-size:46px;line-height:1.2;font-weight:700;max-width:1020px}.ft{display:flex;justify-content:space-between;align-items:center;font-size:34px;color:#98a2b3}.ft b{color:#f5f7fb;font-size:44px;letter-spacing:-.03em}.ft b i{font-style:normal;background:linear-gradient(90deg,#4d94ff,#b78cff);-webkit-background-clip:text;color:transparent}
  </style><div class="top">${logo ? `<img class="lg" src="${logo}">` : ''}<div><h1>${esc(S.name)}</h1><div class="tk">${esc(S.sub)}</div></div></div>
  <div class="v">Разбор акции: отчётность, новости, опционы и сценарии цены</div>
  <div class="ft"><b>Fin<i>Scope</i></b><span>Акции понятным языком</span></div>`;
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(html); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(root, 'data/og', x.t + '.png') }); await p.close();
  console.log('og:', x.t);
}
await b.close();
