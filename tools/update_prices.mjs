// Ежедневное обновление цен без участия Claude: дописывает дневные свечи в data/<ТИКЕР>.json
// и правит поля, которые целиком зависят от цены (закрытие, дневной диапазон, строка «тикер» на ленте).
// Тексты разбора, оценки и новости не трогает: их обновляют ежедневная и еженедельная задачи Claude.
// Запуск: TD_KEY=... node tools/update_prices.mjs   (в GitHub Actions ключ берётся из секрета TD_KEY).
import fs from 'fs';
const D = new URL('../data/', import.meta.url).pathname, KEY = process.env.TD_KEY;
if (!KEY) { console.log('TD_KEY не задан, выходим'); process.exit(0); }
const MON = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const fm = n => '$' + n.toFixed(2), sgn = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2).replace('.', ',') + '%';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reg = JSON.parse(fs.readFileSync(D + 'stocks.json', 'utf8'));
let changed = 0;
for (const x of reg) {
  const f = D + x.t + '.json'; if (!fs.existsSync(f)) continue;
  const S = JSON.parse(fs.readFileSync(f, 'utf8')), td = x.td || { symbol: x.t };
  const q = new URLSearchParams({ symbol: td.symbol || x.t, interval: '1day', outputsize: '6', order: 'ASC', apikey: KEY });
  if (td.mic) q.set('mic_code', td.mic);
  let j;
  try { j = await (await fetch('https://api.twelvedata.com/time_series?' + q)).json(); } catch (e) { console.log(x.t, 'ошибка сети'); continue; }
  const v = j && j.status === 'ok' && Array.isArray(j.values) ? j.values : null;
  if (!v || !v.length) { console.log(x.t, 'нет данных:', (j && j.message) || ''); await sleep(8000); continue; }
  const last = S.daily[S.daily.length - 1][0];
  const rows = v.map(r => [r.datetime.slice(0, 10), +(+r.open).toFixed(2), +(+r.high).toFixed(2), +(+r.low).toFixed(2), +(+r.close).toFixed(2), +((+r.volume || 0) / 1e6).toFixed(1)]).filter(r => r[4] > 0 && r[0] >= last);
  let upd = false;
  for (const r of rows) {
    if (r[0] === last) { const o = S.daily[S.daily.length - 1]; if (r[4] !== o[4]) { S.daily[S.daily.length - 1] = r; upd = true } }
    else { S.daily.push(r); upd = true }
  }
  if (!upd) { await sleep(8000); continue; }
  const a = S.daily[S.daily.length - 1], b = S.daily[S.daily.length - 2];
  const ch = b ? (a[4] / b[4] - 1) * 100 : 0, [y, m, d] = a[0].split('-').map(Number);
  S.ext = Object.assign({}, S.ext, { date: a[0], close: a[4] });
  S.asof = a[0]; S.updated = new Date().toISOString().slice(0, 10);
  if (Array.isArray(S.tape) && S.tape[0] && S.tape[0][0] === x.t) S.tape[0] = [x.t, fm(a[4]), sgn(ch) + ' за ' + d + ' ' + MON[m - 1], ch < 0 ? 'neg' : 'pos'];
  for (const p of S.pills || []) if (/^день:/.test(p.t)) p.t = 'день: ' + fm(a[3]) + ' – ' + fm(a[2]);
  fs.writeFileSync(f, JSON.stringify(S)); changed++; console.log(x.t, a[0], a[4]);
  await sleep(8000); // бесплатный план: 8 запросов в минуту
}
console.log('обновлено файлов:', changed);
