// Собирает data/quotes.json (цена закрытия, вчерашнее закрытие, изменение за день) из data/<ТИКЕР>.json.
// Запуск: node tools/build_quotes.mjs   (после любого обновления цен). Главная страница берёт цены карточек отсюда.
import fs from 'fs';
import { execSync } from 'child_process';
const D = new URL('../data/', import.meta.url).pathname;
const reg = JSON.parse(fs.readFileSync(D + 'stocks.json', 'utf8'));
let old = {}; try { old = JSON.parse(fs.readFileSync(D + 'quotes.json', 'utf8')); } catch (e) {}
// дата добавления разбора: первый коммит файла акции (в GitHub Actions нужен fetch-depth: 0); иначе берём прошлое значение
const added = t => { try { const d = execSync('git log --diff-filter=A --format=%as -- data/' + t + '.json', { cwd: D + '..', stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop(); if (/^\d{4}-\d\d-\d\d$/.test(d)) return d === first ? undefined : d; } catch (e) {} return (old[t] || {}).a; };
let first = ''; try { first = execSync('git log --reverse --format=%as', { cwd: D + '..', stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n')[0]; } catch (e) {}
const out = {};
for (const x of reg) {
  const S = JSON.parse(fs.readFileSync(D + x.t + '.json', 'utf8'));
  const d = S.daily, a = d[d.length - 1], b = d[d.length - 2];
  out[x.t] = { a: added(x.t), c: +a[4], p: b ? +b[4] : null, d: a[0], s: d.slice(-20).map(r => +r[4]),
    ev: (S.events || []).filter(e => e.d >= new Date().toISOString().slice(0, 10) && /отч[её]т/i.test(e.t)).slice(0, 2).map(e => [e.d, e.t.slice(0, 60)]) };
}
fs.writeFileSync(D + 'quotes.json', JSON.stringify(out));
console.log('quotes.json:', Object.keys(out).map(t => t + ' ' + out[t].c).join(', '));
