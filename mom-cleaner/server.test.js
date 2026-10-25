import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-test-'));
process.env.CLEANER_PIN = '1111';
process.env.MOM_PIN = '2222';
const mod = await import('./server.js');
const { server, levelFor, visitPay, payroll, streak, completionRate, emptyDb } = mod;

// ---- цэвэр функцууд ----
test('levelFor: түвшин ба явц', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(149).level, 1);
  assert.equal(levelFor(150).level, 2);
  assert.equal(levelFor(3000).level, 6);
  assert.equal(levelFor(3000).nextXp, null);
  assert.ok(Math.abs(levelFor(275).progress - 0.5) < 1e-9);
});

test('visitPay: цагаар, 15 минутаар бөөрөнхийлнө', () => {
  const s = { rateType: 'hour', rate: 10000, bonusPerPoint: 0 };
  const h = 3600e3;
  assert.equal(visitPay({ clockIn: 0, clockOut: 2 * h }, s), 20000);
  assert.equal(visitPay({ clockIn: 0, clockOut: 2 * h + 10 * 60e3 }, s), 22500);   // 2ц10м → 2ц15м
  assert.equal(visitPay({ clockIn: 0, clockOut: 2 * h + 16 * 60e3 }, s), 25000);   // 2ц16м → 2ц30м
  assert.equal(visitPay({ clockIn: 0, clockOut: null }, s), 0);
});

test('visitPay: айлчлал тутам + оноогийн урамшуулал', () => {
  const s = { rateType: 'visit', rate: 50000, bonusPerPoint: 100 };
  assert.equal(visitPay({ clockIn: 0, clockOut: 1, points: 120 }, s), 62000);
  const tasks = [{ id: 'a', points: 30 }, { id: 'b', points: 20 }];
  assert.equal(visitPay({ clockIn: 0, clockOut: 1, done: ['a', 'b'] }, s, tasks), 55000);
});

test('payroll: сараар нэгтгэх, үлдэгдэл', () => {
  const d = emptyDb();
  d.settings = { rateType: 'visit', rate: 40000, bonusPerPoint: 0 };
  d.visits = [
    { date: '2026-10-01', clockIn: 0, clockOut: 3600e3, done: [], points: 0 },
    { date: '2026-10-08', clockIn: 0, clockOut: 7200e3, done: [], points: 0, pay: 45000 }, // хөлдсөн тариф
    { date: '2026-09-24', clockIn: 0, clockOut: 3600e3, done: [], points: 0 },
    { date: '2026-10-15', clockIn: 0, clockOut: null, done: [] }, // дуусаагүй — тооцохгүй
  ];
  d.payments = [{ amount: 50000, date: '2026-10-10' }];
  const p = payroll(d);
  assert.equal(p.months[0].month, '2026-10');
  assert.equal(p.months[0].earned, 85000);
  assert.equal(p.months[0].visits, 2);
  assert.equal(p.months[0].minutes, 180);
  assert.equal(p.months[1].earned, 40000);
  assert.equal(p.earned, 125000);
  assert.equal(p.balance, 75000);
});

test('streak: сүүлийн дараалсан ≥90% айлчлалууд', () => {
  const tasks = [{ id: 'a', points: 1 }, { id: 'b', points: 1 }];
  const v = (t, done) => ({ clockIn: t, clockOut: t + 1, done });
  assert.equal(streak([v(1, ['a', 'b']), v(2, ['a']), v(3, ['a', 'b']), v(4, ['a', 'b'])], tasks), 2);
  assert.equal(streak([v(1, ['a', 'b']), v(2, ['a', 'b']), { clockIn: 3, clockOut: null, done: [] }], tasks), 2);
  assert.equal(completionRate(v(1, ['a']), tasks), 0.5);
  assert.equal(completionRate(v(1, ['a']), [{ id: 'a' }, { id: 'b', active: false }]), 1);
});

// ---- HTTP урсгал ----
test('API: нэвтрэх → ирлээ → ажил чеклэх → явлаа → цалин', async t => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());
  const jar = {};
  const call = async (who, path, body) => {
    const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', cookie: jar[who] || '', 'sec-fetch-site': 'same-origin' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };

  assert.equal((await call('x', '/api/state')).status, 401);
  assert.equal((await call('c', '/api/login', { role: 'cleaner', pin: '9999' })).status, 401);
  assert.equal((await call('c', '/api/login', { role: 'cleaner', pin: '1111' })).status, 200);
  assert.equal((await call('m', '/api/login', { role: 'mom', pin: '2222' })).status, 200);

  // ээж тариф тохируулна, цэвэрлэгч тохируулж чадахгүй
  assert.equal((await call('c', '/api/settings', { rate: 1 })).status, 403);
  assert.equal((await call('m', '/api/settings', { rateType: 'visit', rate: 30000, bonusPerPoint: 100 })).status, 200);

  // ажил чеклэх — ирэхээс өмнө болохгүй
  let st = (await call('c', '/api/state')).body;
  const t1 = st.tasks[0], t2 = st.tasks[1];
  assert.equal((await call('c', '/api/visit/task', { taskId: t1.id, done: true })).status, 400);
  assert.equal((await call('m', '/api/clock', { action: 'in' })).status, 403);
  assert.equal((await call('c', '/api/clock', { action: 'in' })).status, 200);
  assert.equal((await call('c', '/api/clock', { action: 'in' })).status, 400);
  assert.equal((await call('c', '/api/visit/task', { taskId: t1.id, done: true })).status, 200);
  const r2 = await call('c', '/api/visit/task', { taskId: t2.id, done: true });
  assert.deepEqual(r2.body.visit.done.sort(), [t1.id, t2.id].sort());
  assert.equal(r2.body.visit.points, t1.points + t2.points);

  const out = await call('c', '/api/clock', { action: 'out', note: 'Цонх маргааш' });
  assert.equal(out.status, 200);
  assert.equal(out.body.visit.pay, 30000 + 100 * (t1.points + t2.points));
  assert.equal(out.body.visit.note, 'Цонх маргааш');
  assert.equal(out.body.stats.visits, 1);
  assert.equal(out.body.stats.badges.find(b => b.id === 'first').got, true);

  // хүсэлт хоёр талаас, хуваарь, цалин өгсөн бүртгэл
  assert.equal((await call('m', '/api/requests', { text: 'Хөшиг угаа' })).status, 200);
  assert.equal((await call('c', '/api/requests', { text: 'Нунтаг дууссан' })).status, 200);
  assert.equal((await call('c', '/api/schedule', { date: '2026-11-01', time: '10:00', note: 'ердийн' })).status, 200);
  assert.equal((await call('c', '/api/schedule', { date: 'bad' })).status, 400);
  assert.equal((await call('c', '/api/payments', { amount: 10000 })).status, 403);
  assert.equal((await call('m', '/api/payments', { amount: 10000, date: '2026-10-25' })).status, 200);

  st = (await call('m', '/api/state')).body;
  assert.equal(st.requests.length, 2);
  assert.equal(st.schedule.length, 1);
  assert.equal(st.payroll.paid, 10000);
  assert.equal(st.payroll.balance, out.body.visit.pay - 10000);

  // гарах
  await call('c', '/api/logout', {});
  // cookie устсан (Max-Age=0) → хоосон cookie
  assert.equal((await call('c', '/api/state')).status, 401);
});
