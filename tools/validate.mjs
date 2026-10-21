// Проверка данных FinScope. Запуск: node tools/validate.mjs   (из корня репозитория)
// Завершается с кодом 1, если что-то сломано. Ежедневная задача обязана запускать это перед отправкой в GitHub.
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const errs = [], warns = [];
const err = (f, m) => errs.push(f + ': ' + m);
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { err(f, 'не читается как JSON (' + e.message + ')'); return null; } };
const isNum = v => typeof v === 'number' && isFinite(v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PARTS = ['p', 'd', 'cn', 'cnlink', 'kv', 'items', 'tt', 'bar', 'rbs', 'tl', 'chart', 'files', 'news', 'src', 'gloss'];
const COLORS = ['g', 'r', 'y'];

const reg = read('data/stocks.json');
if (reg) {
  if (!Array.isArray(reg) || !reg.length) err('data/stocks.json', 'должен быть непустым списком');
  else {
    const seen = new Set();
    for (const r of reg) {
      if (!r.t || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(r.t)) err('data/stocks.json', 'плохой тикер ' + JSON.stringify(r.t));
      if (seen.has(r.t)) err('data/stocks.json', 'тикер повторяется: ' + r.t); seen.add(r.t);
      if (!r.name) err('data/stocks.json', r.t + ': нет name');
      if (r.logo && !fs.existsSync(path.join(root, 'data', r.logo))) err('data/stocks.json', r.t + ': нет файла логотипа ' + r.logo);
      checkStock(r.t);
    }
  }
}
function checkStock(t) {
  const f = 'data/' + t + '.json', S = read(f);
  if (!S) return;
  for (const k of ['t', 'name', 'asof', 'daily', 'verdict', 'tape', 'tabs']) if (S[k] == null) err(f, 'нет поля ' + k);
  if (S.t !== t) err(f, 'поле t (' + S.t + ') не совпадает с именем файла');
  if (!ISO.test(S.asof || '')) err(f, 'asof должен быть датой ГГГГ-ММ-ДД');
  // цены
  const d = S.daily || [];
  if (!Array.isArray(d) || d.length < 2) err(f, 'daily: нужно минимум 2 строки');
  let prev = '';
  d.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 6 || !ISO.test(r[0])) return err(f, 'daily[' + i + ']: формат [дата,o,h,l,c,объём]');
    for (let k = 1; k < 6; k++) if (!isNum(r[k])) err(f, 'daily[' + i + ']: не число в позиции ' + k);
    if (r[0] <= prev) err(f, 'daily[' + i + ']: даты должны идти по возрастанию без повторов (' + r[0] + ')');
    if (isNum(r[2]) && isNum(r[3]) && r[2] < r[3]) err(f, 'daily[' + i + ']: максимум меньше минимума');
    if (isNum(r[4]) && r[4] <= 0) err(f, 'daily[' + i + ']: цена закрытия должна быть больше 0');
    prev = r[0];
  });
  if (d.length && S.asof && d[d.length - 1][0] > S.asof) err(f, 'последняя дата в daily позже asof');
  if (d.length && S.asof && d[d.length - 1][0] < S.asof) warns.push(f + ': последняя дата в daily (' + d[d.length - 1][0] + ') раньше asof (' + S.asof + ')');
  if (S.ext) {
    if (!ISO.test(S.ext.date || '')) err(f, 'ext.date должен быть датой');
    for (const k of ['close', 'pre', 'post']) if (S.ext[k] != null && !isNum(S.ext[k])) err(f, 'ext.' + k + ' должно быть числом или null');
  }
  if (S.sparse) S.sparse.forEach((r, i) => { if (!ISO.test(r[0]) || !isNum(r[1])) err(f, 'sparse[' + i + '] плохой формат'); });
  // вердикт
  const v = S.verdict || {};
  if (!v.title || !v.text) err(f, 'verdict: нужны title и text');
  if (!Array.isArray(v.pil) || !v.pil.length) err(f, 'verdict.pil: нужен список оценок');
  else v.pil.forEach((p, i) => { if (!p[0] || !Number.isInteger(p[1]) || p[1] < 1 || p[1] > 5 || !p[2]) err(f, 'verdict.pil[' + i + ']: формат [название, 1..5, подпись]'); });
  if (!Array.isArray(S.tape)) err(f, 'tape должен быть списком');
  // вкладки
  if (!Array.isArray(S.tabs) || !S.tabs.length) return err(f, 'tabs: нужна хотя бы одна вкладка');
  const keys = new Set(); let scen = 0;
  S.tabs.forEach(tab => {
    if (!tab.k || !tab.name || !Array.isArray(tab.blocks)) return err(f, 'вкладка без k/name/blocks');
    if (keys.has(tab.k)) err(f, 'вкладка повторяется: ' + tab.k); keys.add(tab.k);
    const card = (c, w) => {
      if (!c || !c.h || !Array.isArray(c.parts)) return err(f, w + ': у карточки нужны h и parts');
      c.parts.forEach(p => {
        const ks = PARTS.filter(x => p[x] != null);
        if (ks.length !== 1) return err(f, w + ': блок должен иметь ровно один тип из ' + PARTS.join('/') + ' (есть: ' + Object.keys(p).join(',') + ')');
        if (p.items) p.items.forEach(x => { if (!COLORS.includes(x[0]) || !x[1] || !x[2]) err(f, w + ': items формат [g|r|y, заголовок, текст]'); });
        if (p.news) p.news.forEach(x => { if (!COLORS.includes(x[0]) || x.length < 5 || !/^https?:\/\//.test(x[4])) err(f, w + ': news формат [g|r|y, дата, заголовок, текст, https-ссылка]'); });
        if (p.src) p.src.forEach(x => { if (!x[0] || !/^https?:\/\//.test(x[1])) err(f, w + ': src формат [название, https-ссылка]'); });
        if (p.chart && !(Array.isArray(p.chart.items) && p.chart.items.every(x => x.l && isNum(x.v)))) err(f, w + ': chart.items формат [{l,v}]');
        if (p.rbs && p.rbs.some(x => !isNum(+x[1]) || !isNum(+x[2]))) err(f, w + ': rbs числа');
      });
    };
    tab.blocks.forEach((b, i) => {
      const w = tab.k + '#' + i;
      if (b.card) card(b.card, w);
      else if (b.g2) { if (!Array.isArray(b.g2)) err(f, w + ': g2 должен быть списком'); else b.g2.forEach(c => card(c, w)); }
      else if (b.scenarios) { scen++; const s = b.scenarios; for (const k of ['bear', 'base', 'bull']) if (!s[k] || !isNum(s[k].v) || !s[k].t) err(f, w + ': scenarios.' + k + ' нужен {v,t}'); if (!s.h || !s.intro) err(f, w + ': scenarios нужны h и intro'); }
      else if (b.d != null) { }
      else err(f, w + ': неизвестный блок ' + Object.keys(b).join(','));
    });
  });
  if (scen > 1) err(f, 'сценарии (scenarios) допускаются только один раз на акцию');
  if (!keys.has('ver')) warns.push(f + ': нет вкладки ver (после открытия акции сайт показывает именно её)');
  // секреты
  const raw = fs.readFileSync(path.join(root, f), 'utf8');
  if (/apikey|api_key|secret|token/i.test(raw)) err(f, 'в файле похоже на ключ или секрет (слова apikey/secret/token)');
}
// index.html
try {
  const h = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const m = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!m.length) err('index.html', 'нет inline-скрипта');
  else { try { new Function(m[m.length - 1][1]); } catch (e) { err('index.html', 'ошибка синтаксиса JS: ' + e.message); } }
  if (/TD_KEY\s*=|apikey=\w{8,}/i.test(h)) err('index.html', 'похоже на ключ');
} catch (e) { err('index.html', 'не читается'); }
warns.forEach(w => console.log('ВНИМАНИЕ', w));
if (errs.length) { console.log('ОШИБКИ:\n' + errs.map(e => ' - ' + e).join('\n')); process.exit(1); }
console.log('OK: данные в порядке (' + (reg ? reg.length : 0) + ' акц.)');
