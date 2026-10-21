// Собирает data/quotes.json (цена закрытия, вчерашнее закрытие, изменение за день) из data/<ТИКЕР>.json.
// Запуск: node tools/build_quotes.mjs   (после любого обновления цен). Главная страница берёт цены карточек отсюда.
import fs from 'fs';
const D = new URL('../data/', import.meta.url).pathname;
const reg = JSON.parse(fs.readFileSync(D + 'stocks.json', 'utf8'));
const out = {};
for (const x of reg) {
  const S = JSON.parse(fs.readFileSync(D + x.t + '.json', 'utf8'));
  const d = S.daily, a = d[d.length - 1], b = d[d.length - 2];
  out[x.t] = { c: +a[4], p: b ? +b[4] : null, d: a[0] };
}
fs.writeFileSync(D + 'quotes.json', JSON.stringify(out));
console.log('quotes.json:', Object.keys(out).map(t => t + ' ' + out[t].c).join(', '));
