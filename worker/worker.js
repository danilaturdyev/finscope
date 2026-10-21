// FinScope — Cloudflare Worker: отдаёт сайт и живые цены (Twelve Data). Ключ хранится в секрете TD_KEY, в код его не вставляйте.
// Сайт и данные акций лежат в GitHub (index.html и папка data/). Воркер отдаёт страницу и живые цены для любой акции из data/stocks.json.
const BASE = 'https://raw.githubusercontent.com/danilaturdyev/finscope/main/';
const FALLBACK = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinScope</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h1>FinScope</h1><p>Не получилось загрузить сайт. Обновите страницу через минуту.</p>';
async function page() {
  try {
    const r = await fetch(BASE + 'index.html', { cf: { cacheTtl: 120, cacheEverything: true } });
    if (r.ok) { const t = await r.text(); if (t.length > 20000 && t.includes('FinScope')) return t; }
  } catch (e) {}
  return FALLBACK;
}
// Список разрешённых тикеров (чтобы случайные запросы не тратили лимит Twelve Data).
async function allowed(t) {
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) return false;
  try {
    const r = await fetch(BASE + 'data/stocks.json', { cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) { const l = await r.json(); return Array.isArray(l) && l.some(x => x.t === t); }
  } catch (e) {}
  return t === 'MARA';
}
// Доп. параметры источника для тикера (например, биржа XNYS, чтобы Shell не путался с лондонской бумагой). Читаются из data/stocks.json, поле td.
async function tdExtra(t) {
  try {
    const r = await fetch(BASE + 'data/stocks.json', { cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) { const l = await r.json(); const x = Array.isArray(l) && l.find(y => y.t === t); const e = x && x.td; if (e) { let q = ''; if (e.symbol) q += '&symbol=' + encodeURIComponent(e.symbol); if (e.mic) q += '&mic_code=' + encodeURIComponent(e.mic); return { sym: e.symbol || t, mic: e.mic ? '&mic_code=' + encodeURIComponent(e.mic) : '' }; } }
  } catch (e) {}
  return { sym: t, mic: '' };
}
let noPrepost = 0;
const CFG = [
  { iv: '1min',  n: 1000, days: 1,  ttl: 60  },   // 1Д: минутные цены, пре- и пост-маркет
  { iv: '30min', n: 500,  days: 7,  ttl: 600 },   // 1Н
  { iv: '1h',    n: 800,  days: 30, ttl: 900 },   // 1М
];
const JSONH = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' };

function etParts(sec) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(sec * 1000));
  const o = {}; p.forEach(x => o[x.type] = x.value);
  return { h: (+o.hour) % 24, wd: o.weekday, date: o.year + '-' + o.month + '-' + o.day };
}
// Вне торгового окна США (пн–пт 04:00–20:00 по Нью-Йорку) данные почти не меняются — реже ходим к источнику, экономим лимит.
function ttlFor(base) {
  const e = etParts(Date.now() / 1000);
  const open = !['Sat', 'Sun'].includes(e.wd) && e.h >= 4 && e.h < 20;
  return open ? base : Math.max(base, 3600);
}
async function td(path, env) {
  const r = await fetch('https://api.twelvedata.com/' + path + '&apikey=' + env.TD_KEY);
  const j = await r.json();
  if (!r.ok || j.status === 'error') throw new Error((j && j.message) || ('HTTP ' + r.status));
  return j;
}
async function build(i, env, SYMBOL, MIC) {
  const c = CFG[i];
  const base = 'time_series?symbol=' + encodeURIComponent(SYMBOL) + (MIC || '') + '&interval=' + c.iv + '&outputsize=' + c.n + '&timezone=UTC&order=ASC&format=JSON';
  let ts;
  // Пре- и пост-маркет есть только на платных планах Twelve Data. По умолчанию их не запрашиваем (экономим лимит). Чтобы включить на платном плане, добавьте переменную PREPOST=1.
  if (!env.PREPOST || (noPrepost && Date.now() < noPrepost)) {
    ts = await td(base, env);
  } else {
    try { ts = await td(base + '&prepost=true', env); noPrepost = 0; }
    catch (e) {
      if (/pre-?market|post-?market|plan/i.test(String(e.message))) { noPrepost = Date.now() + 6 * 3600e3; ts = await td(base, env); }
      else throw e;
    }
  }
  let pts = (ts.values || []).map(v => [Math.floor(Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000), parseFloat(v.close)]).filter(p => isFinite(p[0]) && isFinite(p[1]));
  if (pts.length < 2) throw new Error('нет данных');
  const last = pts[pts.length - 1][0];
  let prevClose = null;
  if (i === 0) {
    const d = etParts(last).date;
    pts = pts.filter(p => etParts(p[0]).date === d);
    try { const q = await td('quote?symbol=' + encodeURIComponent(SYMBOL) + (MIC || '') + '&format=JSON', env); prevClose = parseFloat(q.previous_close) || null; } catch (e) {}
  } else {
    pts = pts.filter(p => p[0] >= last - c.days * 86400);
  }
  return { symbol: SYMBOL, interval: c.iv, prevClose, points: pts, asOf: last };
}
async function series(u, env, ctx) {
  const i = Math.max(0, Math.min(2, parseInt(u.searchParams.get('r') || '0', 10) || 0));
  const T = (u.searchParams.get('t') || 'MARA').toUpperCase();
  if (!(await allowed(T))) return new Response(JSON.stringify({ error: 'неизвестный тикер' }), { status: 404, headers: JSONH });
  if (!env.TD_KEY) return new Response(JSON.stringify({ error: 'TD_KEY не задан' }), { status: 503, headers: JSONH });
  const cache = caches.default;
  const fresh = new Request(u.origin + '/__fresh/' + T + '/' + i), stale = new Request(u.origin + '/__stale/' + T + '/' + i);
  const hit = await cache.match(fresh);
  if (hit) return hit;
  try {
    const ex = await tdExtra(T);
    const data = await build(i, env, ex.sym, ex.mic);
    data.symbol = T;
    const body = JSON.stringify(data);
    const mk = age => new Response(body, { headers: Object.assign({ 'cache-control': 'public, max-age=' + age }, JSONH) });
    ctx.waitUntil(Promise.all([cache.put(fresh, mk(ttlFor(CFG[i].ttl))), cache.put(stale, mk(86400))]));
    return mk(0);
  } catch (e) {
    const old = await cache.match(stale);
    if (old) { const r = new Response(old.body, old); r.headers.set('x-stale', '1'); return r; }
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: JSONH });
  }
}
export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (u.pathname === '/api/series') return series(u, env, ctx);
    if (u.pathname === '/' || u.pathname === '/index.html')
      return new Response(await page(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    return new Response('Not found', { status: 404 });
  },
};
