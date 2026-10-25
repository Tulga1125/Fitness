// mom.sonorgroup.mn — гэрийн цэвэрлэгчийн апп. Нэг файл, framework-гүй Node сервер.
// Хоёр хэрэглэгч: "cleaner" (цэвэрлэгч) ба "mom" (ээж). PIN-ээр нэвтэрнэ.
// Өгөгдөл DATA_DIR/data.json дотор хадгалагдана (атом бичилт).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PINS = {
  cleaner: process.env.CLEANER_PIN || '1111',
  mom: process.env.MOM_PIN || '2222',
};
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 180);
const TZ = process.env.TZ_NAME || 'Asia/Ulaanbaatar';

fs.mkdirSync(DATA_DIR, { recursive: true });
const SECRET = (() => {
  const f = path.join(DATA_DIR, 'secret');
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
})();

// ---------- өгөгдөл ----------
const DB_FILE = path.join(DATA_DIR, 'data.json');
export const DEFAULT_TASKS = [
  { room: 'Гал тогоо', icon: '🍳', title: 'Аяга таваг угаах', points: 10 },
  { room: 'Гал тогоо', icon: '🍳', title: 'Тавцан, зуух арчих', points: 10 },
  { room: 'Гал тогоо', icon: '🍳', title: 'Шал угаах', points: 10 },
  { room: 'Гал тогоо', icon: '🍳', title: 'Хогийн сав хоослох', points: 5 },
  { room: 'Зочны өрөө', icon: '🛋️', title: 'Тоос соруулах', points: 10 },
  { room: 'Зочны өрөө', icon: '🛋️', title: 'Тавилга, тавцан тоос арчих', points: 5 },
  { room: 'Зочны өрөө', icon: '🛋️', title: 'Дэр, хөнжил янзлах', points: 5 },
  { room: 'Унтлагын өрөө', icon: '🛏️', title: 'Ор засах', points: 5 },
  { room: 'Унтлагын өрөө', icon: '🛏️', title: 'Шал угаах', points: 10 },
  { room: 'Угаалгын өрөө', icon: '🚿', title: 'Суултуур цэвэрлэх', points: 15 },
  { room: 'Угаалгын өрөө', icon: '🚿', title: 'Угаалтуур, толь арчих', points: 10 },
  { room: 'Угаалгын өрөө', icon: '🚿', title: 'Шал угаах', points: 10 },
  { room: 'Бусад', icon: '🪟', title: 'Цонх арчих', points: 15 },
  { room: 'Бусад', icon: '🧺', title: 'Хувцас угаах / өлгөх', points: 10 },
  { room: 'Бусад', icon: '🪴', title: 'Цэцэг услах', points: 5 },
];

function uid() { return crypto.randomBytes(6).toString('hex'); }

export function emptyDb() {
  return {
    tasks: DEFAULT_TASKS.map(t => ({ id: uid(), active: true, ...t })),
    visits: [],      // { id, date, clockIn, clockOut, done: [taskId], points, note }
    requests: [],    // { id, from: 'cleaner'|'mom', text, createdAt, done, doneAt }
    schedule: [],    // { id, date, time, note, by, createdAt }
    payments: [],    // { id, amount, date, note, createdAt }  — ээж цалин өгсөн бүртгэл
    settings: { cleanerName: 'Цэвэрлэгч', momName: 'Ээж', rateType: 'hour', rate: 10000, bonusPerPoint: 0 },
  };
}

let db = loadDb();
function loadDb() {
  try {
    const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const base = emptyDb();
    return { ...base, ...d, tasks: d.tasks ?? base.tasks, settings: { ...base.settings, ...(d.settings || {}) } };
  } catch { return emptyDb(); }
}
function atomicWrite(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function save() { atomicWrite(DB_FILE, JSON.stringify(db, null, 2)); }

// ---------- огноо (Улаанбаатарын цагаар) ----------
export function localDate(ts = Date.now(), tz = TZ) {
  // YYYY-MM-DD
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(ts));
}

// ---------- тоглоомын логик (цэвэр функцууд, тестлэгдсэн) ----------
export const LEVELS = [
  { xp: 0, title: 'Шинэ цэвэрлэгч', icon: '🌱' },
  { xp: 150, title: 'Дадлагажигч', icon: '🧹' },
  { xp: 400, title: 'Мэргэжилтэн', icon: '✨' },
  { xp: 800, title: 'Мастер', icon: '🏅' },
  { xp: 1500, title: 'Гранд мастер', icon: '🏆' },
  { xp: 3000, title: 'Легенд', icon: '👑' },
];
export function levelFor(xp) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k;
  const cur = LEVELS[i], next = LEVELS[i + 1] || null;
  return {
    level: i + 1, title: cur.title, icon: cur.icon, xp,
    nextXp: next ? next.xp : null,
    progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1,
  };
}
export function visitPoints(visit, tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  return (visit.done || []).reduce((s, id) => s + (byId.get(id)?.points || 0), 0);
}
export function completionRate(visit, tasks) {
  const active = tasks.filter(t => t.active !== false);
  if (!active.length) return 0;
  const doneSet = new Set(visit.done || []);
  return active.filter(t => doneSet.has(t.id)).length / active.length;
}
// Дараалсан "бүх ажил дууссан" (≥90%) өдрүүд — хамгийн сүүлийн дууссан айлчлалуудаар
export function streak(visits, tasks) {
  const closed = visits.filter(v => v.clockOut).sort((a, b) => b.clockIn - a.clockIn);
  let n = 0;
  for (const v of closed) {
    if ((v.rate ?? completionRate(v, tasks)) >= 0.9) n++; else break;
  }
  return n;
}
export function badges(visits, tasks) {
  const closed = visits.filter(v => v.clockOut);
  const perfect = closed.filter(v => (v.rate ?? completionRate(v, tasks)) >= 1).length;
  const fast = closed.some(v => (v.rate ?? completionRate(v, tasks)) >= 1 && v.clockOut - v.clockIn <= 2 * 3600e3);
  const early = closed.some(v => new Date(v.clockIn).toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false }) < '09:00');
  const xp = closed.reduce((s, v) => s + (v.points ?? visitPoints(v, tasks)), 0);
  return [
    { id: 'first', icon: '🎉', title: 'Эхний айлчлал', got: closed.length >= 1 },
    { id: 'five', icon: '🖐️', title: '5 айлчлал', got: closed.length >= 5 },
    { id: 'ten', icon: '🔟', title: '10 айлчлал', got: closed.length >= 10 },
    { id: 'perfect', icon: '💯', title: 'Төгс өдөр', got: perfect >= 1 },
    { id: 'perfect5', icon: '🌟', title: '5 төгс өдөр', got: perfect >= 5 },
    { id: 'streak3', icon: '🔥', title: '3 өдөр дараалан', got: streak(visits, tasks) >= 3 },
    { id: 'fast', icon: '⚡', title: 'Хурдан гар (2 цагт)', got: fast },
    { id: 'early', icon: '🌅', title: 'Эрт шувуу (9-өөс өмнө)', got: early },
    { id: 'xp1000', icon: '💎', title: '1000 оноо', got: xp >= 1000 },
  ];
}
export function stats(d) {
  const closed = d.visits.filter(v => v.clockOut);
  const xp = closed.reduce((s, v) => s + (v.points ?? visitPoints(v, d.tasks)), 0);
  return {
    xp, level: levelFor(xp), streak: streak(d.visits, d.tasks), visits: closed.length,
    badges: badges(d.visits, d.tasks),
    hours: Math.round(closed.reduce((s, v) => s + (v.clockOut - v.clockIn), 0) / 36e4) / 10,
    earned: closed.reduce((s, v) => s + (v.pay ?? visitPay(v, d.settings, d.tasks)), 0),
  };
}
export function openVisit(d) { return d.visits.find(v => !v.clockOut) || null; }

// ---------- цалин ----------
// Айлчлалын цалин: цагийн тариф (минутаар, 15 минут хүртэл дээш бөөрөнхийлнө) эсвэл айлчлал тутмын тариф,
// дээр нь оноо тутмын урамшуулал. Тариф айлчлал дуусахад хөлдөнө (visit.pay), тариф хожим өөрчлөгдсөн ч түүх хэвээр.
export function visitPay(visit, settings, tasks = []) {
  if (!visit.clockOut) return 0;
  const rate = Number(settings.rate) || 0;
  const bonus = (Number(settings.bonusPerPoint) || 0) * (visit.points ?? visitPoints(visit, tasks));
  if (settings.rateType === 'visit') return Math.round(rate + bonus);
  const quarters = Math.ceil((visit.clockOut - visit.clockIn) / (15 * 60e3));
  return Math.round(rate * quarters / 4 + bonus);
}
export function payroll(d) {
  const months = {};
  const m = key => months[key] || (months[key] = { month: key, earned: 0, paid: 0, visits: 0, minutes: 0 });
  for (const v of d.visits) {
    if (!v.clockOut) continue;
    const r = m(v.date.slice(0, 7));
    r.earned += v.pay ?? visitPay(v, d.settings, d.tasks);
    r.visits++; r.minutes += Math.round((v.clockOut - v.clockIn) / 60e3);
  }
  for (const p of d.payments || []) m(p.date.slice(0, 7)).paid += Number(p.amount) || 0;
  const list = Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
  const earned = list.reduce((s, r) => s + r.earned, 0), paid = list.reduce((s, r) => s + r.paid, 0);
  return { months: list, earned, paid, balance: earned - paid };
}

// ---------- session cookie ----------
function sign(s) { return crypto.createHmac('sha256', SECRET).update(s).digest('base64url'); }
function makeToken(role) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const body = `${role}.${exp}`;
  return `${body}.${sign(body)}`;
}
function readToken(tok) {
  if (!tok) return null;
  const i = tok.lastIndexOf('.');
  const body = tok.slice(0, i), sig = tok.slice(i + 1);
  if (!body || !sig) return null;
  const good = sign(body);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const [role, exp] = body.split('.');
  if (!['cleaner', 'mom'].includes(role) || Number(exp) < Date.now()) return null;
  return role;
}
function cookies(req) {
  const out = {};
  for (const p of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}
function cookieHeader(value, maxAge, req) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `mom_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------- туслахууд ----------
function json(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('bad json')); } });
  });
}
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

// PIN brute-force хязгаар: IP тутамд 10 алдаа / 15 мин
const fails = new Map();
function rateLimited(ip) {
  const f = fails.get(ip);
  return f && f.n >= 10 && Date.now() - f.t < 15 * 60e3;
}
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); }
  f.n++; fails.set(ip, f);
}

// ---------- AI (сонголттой) ----------
let anthropic = null;
async function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic();
  }
  return anthropic;
}
export function summaryInput(d, days = 14) {
  const since = Date.now() - days * 864e5;
  const visits = d.visits.filter(v => v.clockIn >= since).map(v => ({
    date: v.date,
    in: new Date(v.clockIn).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
    out: v.clockOut ? new Date(v.clockOut).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : null,
    done: (v.done || []).map(id => d.tasks.find(t => t.id === id)?.title).filter(Boolean),
    skipped: d.tasks.filter(t => t.active !== false && !(v.done || []).includes(t.id)).map(t => t.title),
    note: v.note || '',
    pay: v.pay ?? visitPay(v, d.settings, d.tasks),
  }));
  const requests = d.requests.filter(r => r.createdAt >= since).map(r => ({ from: r.from, text: r.text, done: !!r.done }));
  return { visits, requests, schedule: d.schedule.filter(s => s.date >= localDate(since)), payroll: payroll(d), rate: d.settings };
}

// ---------- routes ----------
const routes = {
  'GET /api/health': (req, res) => json(res, 200, { ok: true }),

  'POST /api/login': async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (rateLimited(ip)) return json(res, 429, { error: 'Хэт олон удаа буруу оролдлого. 15 минутын дараа дахин оролдоно уу.' });
    const { role, pin } = await readBody(req);
    if (!PINS[role] || String(pin) !== PINS[role]) { noteFail(ip); return json(res, 401, { error: 'PIN буруу байна' }); }
    json(res, 200, { role }, { 'Set-Cookie': cookieHeader(makeToken(role), SESSION_DAYS * 86400, req) });
  },
  'POST /api/logout': (req, res) => json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0, req) }),

  'GET /api/state': (req, res, role) => {
    json(res, 200, {
      role, today: localDate(), settings: db.settings, tasks: db.tasks,
      openVisit: openVisit(db),
      visits: db.visits.slice(-60),
      requests: db.requests.slice(-100),
      schedule: db.schedule.filter(s => s.date >= localDate(Date.now() - 7 * 864e5)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      stats: stats(db),
      payroll: payroll(db),
      payments: (db.payments || []).slice(-100),
      ai: !!process.env.ANTHROPIC_API_KEY,
    });
  },

  // ---- цэвэрлэгч: ирсэн/явсан ----
  'POST /api/clock': async (req, res, role) => {
    if (role !== 'cleaner') return json(res, 403, { error: 'Зөвхөн цэвэрлэгч' });
    const { action, note } = await readBody(req);
    const open = openVisit(db);
    if (action === 'in') {
      if (open) return json(res, 400, { error: 'Аль хэдийн ирсэн бүртгэлтэй' });
      const v = { id: uid(), date: localDate(), clockIn: Date.now(), clockOut: null, done: [], points: 0, note: '' };
      db.visits.push(v); save();
      return json(res, 200, { visit: v });
    }
    if (action === 'out') {
      if (!open) return json(res, 400, { error: 'Ирсэн бүртгэл алга' });
      open.clockOut = Date.now();
      open.note = str(note, 1000);
      open.points = visitPoints(open, db.tasks);
      open.rate = completionRate(open, db.tasks);
      open.pay = visitPay(open, db.settings, db.tasks);
      save();
      return json(res, 200, { visit: open, stats: stats(db) });
    }
    json(res, 400, { error: 'action in|out' });
  },
  'POST /api/visit/task': async (req, res, role) => {
    if (role !== 'cleaner') return json(res, 403, { error: 'Зөвхөн цэвэрлэгч' });
    const open = openVisit(db);
    if (!open) return json(res, 400, { error: 'Эхлээд "Ирлээ" дарна уу' });
    const { taskId, done } = await readBody(req);
    if (!db.tasks.some(t => t.id === taskId)) return json(res, 404, { error: 'Ажил олдсонгүй' });
    const set = new Set(open.done);
    done ? set.add(taskId) : set.delete(taskId);
    open.done = [...set];
    open.points = visitPoints(open, db.tasks);
    save();
    json(res, 200, { visit: open });
  },

  // ---- ээж: ажлын жагсаалт ----
  'POST /api/tasks/save': async (req, res, role) => {
    if (role !== 'mom') return json(res, 403, { error: 'Зөвхөн ээж' });
    const b = await readBody(req);
    const title = str(b.title, 80), room = str(b.room, 40) || 'Бусад';
    if (!title) return json(res, 400, { error: 'Нэр хоосон' });
    const points = Math.max(1, Math.min(100, Number(b.points) || 5));
    const icon = str(b.icon, 4) || '🧽';
    let t = db.tasks.find(x => x.id === b.id);
    if (t) Object.assign(t, { title, room, points, icon, active: b.active !== false });
    else { t = { id: uid(), title, room, points, icon, active: true }; db.tasks.push(t); }
    save();
    json(res, 200, { task: t, tasks: db.tasks });
  },
  'POST /api/tasks/delete': async (req, res, role) => {
    if (role !== 'mom') return json(res, 403, { error: 'Зөвхөн ээж' });
    const { id } = await readBody(req);
    const used = db.visits.some(v => (v.done || []).includes(id));
    if (used) { const t = db.tasks.find(x => x.id === id); if (t) t.active = false; }  // түүх хадгалагдана
    else db.tasks = db.tasks.filter(t => t.id !== id);
    save();
    json(res, 200, { tasks: db.tasks });
  },
  'POST /api/settings': async (req, res, role) => {
    if (role !== 'mom') return json(res, 403, { error: 'Зөвхөн ээж' });
    const b = await readBody(req);
    if (b.cleanerName != null) db.settings.cleanerName = str(b.cleanerName, 40) || 'Цэвэрлэгч';
    if (b.momName != null) db.settings.momName = str(b.momName, 40) || 'Ээж';
    if (b.rateType != null) db.settings.rateType = b.rateType === 'visit' ? 'visit' : 'hour';
    if (b.rate != null) db.settings.rate = Math.max(0, Math.min(1e8, Number(b.rate) || 0));
    if (b.bonusPerPoint != null) db.settings.bonusPerPoint = Math.max(0, Math.min(1e6, Number(b.bonusPerPoint) || 0));
    save();
    json(res, 200, { settings: db.settings });
  },

  // ---- хүсэлт (хоёулаа бичнэ) ----
  'POST /api/requests': async (req, res, role) => {
    const { text } = await readBody(req);
    const t = str(text, 1000);
    if (!t) return json(res, 400, { error: 'Хоосон' });
    const r = { id: uid(), from: role, text: t, createdAt: Date.now(), done: false, doneAt: null };
    db.requests.push(r); save();
    json(res, 200, { request: r });
  },
  'POST /api/requests/done': async (req, res, role) => {
    const { id, done } = await readBody(req);
    const r = db.requests.find(x => x.id === id);
    if (!r) return json(res, 404, { error: 'Олдсонгүй' });
    r.done = !!done; r.doneAt = done ? Date.now() : null; r.doneBy = done ? role : null;
    save();
    json(res, 200, { request: r });
  },
  'POST /api/requests/delete': async (req, res, role) => {
    const { id } = await readBody(req);
    const r = db.requests.find(x => x.id === id);
    if (!r) return json(res, 404, { error: 'Олдсонгүй' });
    if (r.from !== role && role !== 'mom') return json(res, 403, { error: 'Зөвхөн өөрийнхийг' });
    db.requests = db.requests.filter(x => x.id !== id); save();
    json(res, 200, { ok: true });
  },

  // ---- хуваарь (хоёулаа оруулна) ----
  'POST /api/schedule': async (req, res, role) => {
    const b = await readBody(req);
    const date = str(b.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Огноо буруу' });
    const time = /^\d{2}:\d{2}$/.test(str(b.time, 5)) ? str(b.time, 5) : '';
    let s = db.schedule.find(x => x.id === b.id);
    if (s) Object.assign(s, { date, time, note: str(b.note, 200) });
    else { s = { id: uid(), date, time, note: str(b.note, 200), by: role, createdAt: Date.now() }; db.schedule.push(s); }
    save();
    json(res, 200, { item: s });
  },
  'POST /api/schedule/delete': async (req, res, role) => {
    const { id } = await readBody(req);
    db.schedule = db.schedule.filter(x => x.id !== id); save();
    json(res, 200, { ok: true });
  },

  // ---- цалин өгсөн бүртгэл (ээж) ----
  'POST /api/payments': async (req, res, role) => {
    if (role !== 'mom') return json(res, 403, { error: 'Зөвхөн ээж' });
    const b = await readBody(req);
    const amount = Math.round(Number(b.amount));
    if (!(amount > 0)) return json(res, 400, { error: 'Дүн буруу' });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(str(b.date, 10)) ? str(b.date, 10) : localDate();
    const p = { id: uid(), amount, date, note: str(b.note, 200), createdAt: Date.now() };
    db.payments.push(p); save();
    json(res, 200, { payment: p, payroll: payroll(db) });
  },
  'POST /api/payments/delete': async (req, res, role) => {
    if (role !== 'mom') return json(res, 403, { error: 'Зөвхөн ээж' });
    const { id } = await readBody(req);
    db.payments = db.payments.filter(x => x.id !== id); save();
    json(res, 200, { payroll: payroll(db) });
  },

  // ---- AI тойм (ээж; ANTHROPIC_API_KEY байвал) ----
  'POST /api/ai/summary': async (req, res, role) => {
    if (role !== 'mom') return json(res, 403, { error: 'Зөвхөн ээж' });
    const client = await getAnthropic();
    if (!client) return json(res, 503, { error: 'AI идэвхгүй (ANTHROPIC_API_KEY тохируулаагүй)' });
    const { question } = await readBody(req);
    const data = summaryInput(db);
    try {
      const response = await client.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: 'Чи гэрийн цэвэрлэгчийн ажлын бүртгэлийг ээжид монгол хэлээр тайлбарлаж өгдөг туслах. Богино, тодорхой, найрсаг бич. Өгөгдлөөс гадуур зүйл зохиож болохгүй. Markdown жагсаалт ашиглаж болно.',
        messages: [{
          role: 'user',
          content: `Сүүлийн 14 хоногийн бүртгэл (JSON):\n${JSON.stringify(data)}\n\nАсуулт: ${str(question, 500) || 'Энэ 2 долоо хоногийн ажлын товч тойм, хийгдээгүй үлдсэн ажлууд, анхаарах зүйлсийг хэлж өгөөч.'}`,
        }],
      });
      if (response.stop_reason === 'refusal') return json(res, 200, { text: 'AI хариулахаас татгалзлаа.' });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      json(res, 200, { text });
    } catch (e) {
      console.error('ai error', e?.status, e?.message);
      json(res, 502, { error: 'AI хүсэлт амжилтгүй: ' + (e?.message || 'unknown') });
    }
  },
};

const PUBLIC_ROUTES = new Set(['GET /api/health', 'POST /api/login', 'POST /api/logout']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  let p = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA: бусад замыг index.html руу
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    return fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = req.method + ' ' + url.pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (url.pathname.startsWith('/api/')) {
      const handler = routes[key];
      if (!handler) return json(res, 404, { error: 'not found' });
      let role = null;
      if (!PUBLIC_ROUTES.has(key)) {
        role = readToken(cookies(req).mom_session);
        if (!role) return json(res, 401, { error: 'Нэвтрэх шаардлагатай' });
        if (req.method !== 'GET') {
          // CSRF: зөвхөн ижил origin-оос (fetch нь Sec-Fetch-Site илгээдэг)
          const sfs = req.headers['sec-fetch-site'];
          if (sfs && sfs !== 'same-origin' && sfs !== 'none') return json(res, 403, { error: 'cross-site' });
        }
      }
      return await handler(req, res, role);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message || 'error' });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`mom-cleaner listening on :${PORT}, data in ${DATA_DIR}`));
}
