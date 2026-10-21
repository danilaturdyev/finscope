// Создаёт заготовку новой акции: data/<ТИКЕР>.json со всеми 11 вкладками, запись в data/stocks.json, quotes.json.
// Использование:
//   node tools/new_stock.mjs ТИКЕР "Название" "Юр. название" "Биржа" "Отрасль RU" "Отрасль EN" prices.csv [--round] [--mic XNYS]
// prices.csv: по строке на день без заголовка: ГГГГ-ММ-ДД,open,high,low,close,объём_в_млн (даты по возрастанию).
// Во всех текстах заготовки стоит метка TODO. Пока она есть, node tools/validate.mjs не пропустит файл, так что недописанная акция на сайт не попадёт.
import fs from 'fs';
const a = process.argv.slice(2), flags = a.filter(x => x.startsWith('--')), pos = a.filter(x => !x.startsWith('--'));
const mic = flags.includes('--mic') ? a[a.indexOf('--mic') + 1] : null;
if (mic) pos.splice(pos.indexOf(mic), 1);
const [t, name, legal, exch, sec, secEn, csv] = pos;
if (!t || !name || !legal || !exch || !sec || !secEn || !csv) { console.error('Нужно: ТИКЕР "Название" "Юр. название" "Биржа" "Отрасль RU" "Отрасль EN" prices.csv'); process.exit(1); }
if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) { console.error('Тикер: заглавные буквы, например PLTR'); process.exit(1); }
const D = new URL('../data/', import.meta.url).pathname;
if (fs.existsSync(D + t + '.json')) { console.error('Файл data/' + t + '.json уже есть'); process.exit(1); }
const daily = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/).map(l => l.split(',')).map(r => [r[0].trim(), ...r.slice(1, 6).map(Number)]);
if (daily.length < 2 || daily.some(r => r.length !== 6 || r.some((v, i) => i && !Number.isFinite(v)))) { console.error('prices.csv: нужно минимум 2 строки формата дата,open,high,low,close,объём'); process.exit(1); }
const last = daily[daily.length - 1], prev = daily[daily.length - 2];
const chg = (last[4] - prev[4]) / prev[4] * 100, sg = chg >= 0 ? '+' : '−';
const pct = sg + Math.abs(chg).toFixed(2).replace('.', ',') + '%';
const today = new Date().toISOString().slice(0, 10);
const TODO = 'TODO: заполнить';
const card = (h, ...parts) => ({ card: { h, parts } });
const tab = (k, name, ...blocks) => ({ k, name, blocks });
const S = {
  t, name, legal, exch, sub: exch + ': ' + t + ' · ' + TODO, asof: last[0], updated: today, reviewed: today,
  ext: { date: last[0], close: last[4], pre: null, post: null }, daily,
  pills: [{ t: 'закрытие $' + last[4].toFixed(2) + ' (' + pct + ')', c: chg >= 0 ? 'up' : 'dn' }],
  verdict: { title: TODO + ': вердикт одной фразой', text: TODO + ': 2-3 предложения, что сейчас происходит с компанией', pil: [['Фундамент', 3, TODO], ['Новости и макро', 3, TODO], ['Опционы', 3, TODO], ['Потенциал роста', 3, TODO], ['Риск потерь', 3, TODO]] },
  tape: [[t, '$' + last[4].toFixed(2), pct + ' за ' + last[0], chg >= 0 ? 'pos' : 'neg']],
  tabs: [
    tab('ver', 'Итог', card('Итог', { p: TODO + ': главный вывод, 3-4 предложения' }, { items: [['g', TODO + ' сильная сторона', TODO], ['r', TODO + ' риск', TODO]] })),
    tab('co', 'О компании', card('Чем занимается ' + name, { p: TODO + ': простыми словами, как компания зарабатывает' })),
    tab('fin', 'Отчётность', card('Последний отчёт', { kv: [['Выручка', TODO], ['Чистая прибыль', TODO]] })),
    tab('term', 'Терминал', card('Котировка · ' + last[0], { tt: [['Закрытие', '$' + last[4].toFixed(2)], ['Открытие', '$' + last[1].toFixed(2)], ['Максимум дня', '$' + last[2].toFixed(2)], ['Минимум дня', '$' + last[3].toFixed(2)], ['Объём', last[5] + ' млн'], ['Капитализация', TODO], ['P/E', TODO], ['Бета', TODO], ['52 недели', TODO]] })),
    tab('opt', 'Опционы', card('Что показывают опционы', { p: TODO })),
    tab('sw', 'Сильные и слабые', card('Сильные стороны', { items: [['g', TODO, TODO]] }), card('Слабые стороны', { items: [['r', TODO, TODO]] })),
    tab('news', 'Новости мира', card('Новости', { news: [['y', last[0], TODO + ' заголовок', TODO, 'https://example.com/']] })),
    tab('sc', 'Сценарии', { scenarios: { h: 'Сценарии цены', intro: TODO, amt: 500, bear: { v: Math.round(last[4] * 0.8), t: TODO }, base: { v: Math.round(last[4]), t: TODO }, bull: { v: Math.round(last[4] * 1.2), t: TODO } } }),
    tab('sec', 'SEC и инсайдеры', card('Документы SEC', { p: TODO })),
    tab('gl', 'Словарь', card('Словарь для новичка', { gloss: [['P/E', 'Цена акции, делённая на прибыль на акцию за год. Показывает, сколько лет прибыли вы платите за акцию. Чем выше, тем дороже акция относительно прибыли.']] })),
    tab('src', 'Источники', card('Источники данных', { src: [['SEC EDGAR', 'https://www.sec.gov/edgar/search/']] })),
  ],
  en: {},
};
fs.writeFileSync(D + t + '.json', JSON.stringify(S));
const reg = JSON.parse(fs.readFileSync(D + 'stocks.json', 'utf8'));
const alt = [...new Set([name, legal, name.replace(/ (Inc|Corp|plc|Holdings)\.?$/i, '')].map(x => x.toLowerCase()))];
const row = { t, name, legal, sub: exch + ': ' + t + ' · ' + TODO, sector: sec, alt, en: { [sec]: secEn } };
if (flags.includes('--round')) row.logoShape = 'round';
if (mic) row.td = { symbol: t, mic }; else row.td = { symbol: t };
reg.push(row);
fs.writeFileSync(D + 'stocks.json', JSON.stringify(reg));
console.log('Создано: data/' + t + '.json и запись в data/stocks.json.\nДальше:\n 1) положите логотип в data/logos/' + t + '.png и допишите "logo":"logos/' + t + '.png" в stocks.json И в data/' + t + '.json (на странице акции логотип берётся из её файла);\n 2) заполните все TODO и поле en (переводы);\n 3) node tools/build_quotes.mjs; node tools/og.mjs ' + t + '; node tools/validate.mjs');
