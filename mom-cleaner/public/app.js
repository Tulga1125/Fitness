/* Ээжийн гэр — цэвэрлэгчийн апп. Vanilla JS, framework-гүй. */
(() => {
const $ = s => document.querySelector(s);
const app = $('#app');
const S = { me: null, data: null, tab: 'today', sheet: null, pin: '', role: 'cleaner', err: '', ai: '' };
const WD = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
const TZ = 'Asia/Ulaanbaatar';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDur = ms => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)}ц ${m % 60}м` : `${m}м`; };
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, s / 60 % 60, s % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':'); };
const fmtMoney = n => (Math.round(n) || 0).toLocaleString('en-US') + '₮';
const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return `${m}-р сарын ${dd}, ${WD[w]}`; };
const fmtMonth = k => { const [y, m] = k.split('-'); return `${y} оны ${Number(m)}-р сар`; };
const todayStr = () => S.data?.today || new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const weekday = d => { const [y, m, dd] = d.split('-').map(Number); return WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; };

function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms); }

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && path !== '/api/login') { S.me = null; S.data = null; render(); throw new Error('auth'); }
  if (!r.ok) { toast(j.error || 'Алдаа гарлаа'); throw new Error(j.error || r.status); }
  return j;
}
async function load() {
  try { S.data = await api('/api/state'); S.me = S.data.role; } catch (e) { if (e.message !== 'auth') console.error(e); }
  render();
}

// ---------- confetti ----------
function confetti(n = 120) {
  const c = $('#confetti'), ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const cols = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#fff'];
  const ps = Array.from({ length: n }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * 200, vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += .05; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); ctx.restore(); }
    if (t++ < 220) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
  })();
}

// ---------- rendering ----------
function render() {
  if (!S.me) return renderLogin();
  const d = S.data; if (!d) return;
  const tabs = S.me === 'cleaner'
    ? [['today', '🧹', 'Өнөөдөр'], ['requests', '💬', 'Хүсэлт'], ['schedule', '📅', 'Хуваарь'], ['me', '🏆', 'Миний']]
    : [['home', '🏠', 'Нүүр'], ['tasks', '📝', 'Ажлууд'], ['requests', '💬', 'Хүсэлт'], ['schedule', '📅', 'Хуваарь'], ['money', '💰', 'Цалин']];
  if (!tabs.some(t => t[0] === S.tab)) S.tab = tabs[0][0];
  const openReq = d.requests.filter(r => !r.done && r.from !== S.me).length;
  const views = { today: vToday, requests: vRequests, schedule: vSchedule, me: vMe, home: vHome, tasks: vTasks, money: vMoney };
  app.innerHTML = `
    <div class="top">
      <div><h2>${S.me === 'cleaner' ? '🧹 ' + esc(d.settings.cleanerName) : '👩 ' + esc(d.settings.momName)}</h2><small>${fmtDate(d.today)}</small></div>
      <button class="link" data-act="logout">Гарах</button>
    </div>
    ${views[S.tab](d)}
    <nav class="tabs">${tabs.map(([k, ic, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><span>${ic}</span>${l}${k === 'requests' && openReq ? `<i class="dot">${openReq}</i>` : ''}</button>`).join('')}</nav>
    ${S.sheet ? renderSheet(d) : ''}`;
}

function renderLogin() {
  app.innerHTML = `<div class="login">
    <div style="font-size:72px">🏠</div>
    <h1>Ээжийн гэр</h1>
    <p>Хэн нэвтрэх вэ?</p>
    <div class="roles">
      <button class="role ${S.role === 'cleaner' ? 'sel' : ''}" data-role="cleaner"><span>🧹</span>Цэвэрлэгч</button>
      <button class="role ${S.role === 'mom' ? 'sel' : ''}" data-role="mom"><span>👩</span>Ээж</button>
    </div>
    <p>PIN код</p>
    <div class="pinbox">${[0, 1, 2, 3].map(i => `<i class="${S.pin.length > i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="err">${esc(S.err)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-key="${k}">${k}</button>`).join('')}</div>
  </div>`;
}

// ===== Цэвэрлэгч =====
function ringSvg(p, label) {
  const r = 40, c = 2 * Math.PI * r;
  return `<div class="ring"><svg width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
    <circle class="bg" cx="48" cy="48" r="${r}"/><circle class="fg" cx="48" cy="48" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg><b>${label}</b></div>`;
}
function groupTasks(tasks) {
  const g = new Map();
  for (const t of tasks.filter(t => t.active !== false)) { if (!g.has(t.room)) g.set(t.room, []); g.get(t.room).push(t); }
  return g;
}
function vToday(d) {
  const v = d.openVisit, active = d.tasks.filter(t => t.active !== false);
  const done = new Set(v?.done || []);
  const nDone = active.filter(t => done.has(t.id)).length;
  const pts = active.filter(t => done.has(t.id)).reduce((s, t) => s + t.points, 0);
  const total = active.reduce((s, t) => s + t.points, 0);
  const lv = d.stats.level;
  const todaySched = d.schedule.find(s => s.date === d.today);
  const momReqs = d.requests.filter(r => r.from === 'mom' && !r.done);
  const lastClosed = [...d.visits].reverse().find(x => x.clockOut && x.date === d.today);
  let clock;
  if (v) clock = `<div class="card clock"><span class="state live pulse">● Ажиллаж байна</span><div class="big" id="timer">${fmtClock(Date.now() - v.clockIn)}</div><div class="muted">Ирсэн: ${fmtTime(v.clockIn)}</div>
      <div style="height:12px"></div><button class="btn out" data-act="clockout">🏁 Явлаа — ажил дууслаа</button></div>`;
  else if (lastClosed) clock = `<div class="card clock"><span class="state">✅ Өнөөдөр дууссан</span><div class="big">${fmtDur(lastClosed.clockOut - lastClosed.clockIn)}</div><div class="muted">${fmtTime(lastClosed.clockIn)} → ${fmtTime(lastClosed.clockOut)} · ${lastClosed.points} оноо · ${fmtMoney(lastClosed.pay)}</div>
      <div style="height:12px"></div><button class="btn ghost" data-act="clockin">Дахин ирлээ</button></div>`;
  else clock = `<div class="card clock"><span class="state">Хараахан ирээгүй</span><div class="big">--:--:--</div>${todaySched ? `<div class="muted">Өнөөдрийн хуваарь: ${todaySched.time || ''} ${esc(todaySched.note || '')}</div>` : ''}
      <div style="height:12px"></div><button class="btn ok" data-act="clockin">👋 Ирлээ — ажил эхэлье</button></div>`;
  return `
    <div class="hero"><div class="lvl"><div class="ic">${lv.icon}</div><div class="grow"><small>Түвшин ${lv.level}</small><b>${lv.title}</b></div><div style="text-align:right"><small>🔥 ${d.stats.streak} өдөр</small><br><b>${d.stats.xp} XP</b></div></div>
      <div class="xpbar"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
      <div class="meta"><span>${lv.xp} XP</span><span>${lv.nextXp ? `дараагийн түвшин: ${lv.nextXp} XP` : 'Дээд түвшин!'}</span></div></div>
    ${clock}
    ${momReqs.length ? `<div class="card"><h3>💌 Ээжийн хүсэлт</h3>${momReqs.map(r => `<div class="item"><div class="who mom">👩</div><div class="txt"><p>${esc(r.text)}</p><small>${fmtDate(new Date(r.createdAt).toLocaleDateString('en-CA', { timeZone: TZ }))}</small></div><button class="btn sm ok" data-reqdone="${r.id}">Хийсэн ✓</button></div>`).join('')}</div>` : ''}
    <div class="card"><div class="row">${ringSvg(active.length ? nDone / active.length : 0, `${nDone}/${active.length}`)}<div class="grow"><h3 style="margin:0">Өнөөдрийн ажлууд</h3><div class="muted">${v ? 'Хийсэн ажлаа дарж тэмдэглэ' : 'Эхлээд «Ирлээ» дарна уу'}</div><div style="margin-top:8px;font-weight:800;color:var(--p)">⭐ ${pts} / ${total} оноо</div></div></div></div>
    ${[...groupTasks(d.tasks)].map(([room, ts]) => `<div class="room"><h4>${esc(ts[0].icon)} ${esc(room)} <span class="chip">${ts.filter(t => done.has(t.id)).length}/${ts.length}</span></h4>
      ${ts.map(t => `<div class="task ${done.has(t.id) ? 'done' : ''}" data-task="${t.id}"><div class="chk">${done.has(t.id) ? '✓' : ''}</div><div class="t">${esc(t.title)}</div><div class="pts">+${t.points}</div></div>`).join('')}</div>`).join('')}
    <div style="height:10px"></div>`;
}
function vMe(d) {
  const s = d.stats, pr = d.payroll, cur = pr.months[0];
  const closed = d.visits.filter(v => v.clockOut).slice(-10).reverse();
  return `
    <div class="hero"><div class="lvl"><div class="ic">${s.level.icon}</div><div class="grow"><small>Түвшин ${s.level.level}</small><b>${s.level.title}</b></div><b>${s.xp} XP</b></div>
      <div class="xpbar"><i style="width:${Math.round(s.level.progress * 100)}%"></i></div>
      <div class="pills"><span class="pill">🔥 ${s.streak} дараалан</span><span class="pill">🏠 ${s.visits} айлчлал</span><span class="pill">⏱ ${s.hours} цаг</span></div></div>
    <div class="card"><h3>💰 Миний цалин</h3>
      <div class="row"><div class="grow"><div class="muted">${cur ? fmtMonth(cur.month) : 'Энэ сар'}</div><div class="money">${fmtMoney(cur?.earned || 0)}</div></div>
      <div style="text-align:right"><div class="muted">Авах үлдэгдэл</div><div class="money" style="color:${pr.balance > 0 ? 'var(--ok)' : 'var(--muted)'}">${fmtMoney(pr.balance)}</div></div></div>
      <div class="muted" style="margin-top:8px">Тариф: ${d.settings.rateType === 'visit' ? `${fmtMoney(d.settings.rate)} / айлчлал` : `${fmtMoney(d.settings.rate)} / цаг`}${d.settings.bonusPerPoint ? ` + ${fmtMoney(d.settings.bonusPerPoint)} / оноо` : ''}</div></div>
    <div class="card"><h3>🏅 Шагналууд</h3><div class="badges">${s.badges.map(b => `<div class="badge ${b.got ? '' : 'off'}"><span>${b.icon}</span>${b.title}</div>`).join('')}</div></div>
    <div class="card"><h3>📜 Сүүлийн айлчлалууд</h3>${closed.length ? closed.map(v => visitRow(v, d)).join('') : '<div class="empty"><span>🌱</span>Эхний айлчлал хүлээж байна</div>'}</div>`;
}
function visitRow(v, d) {
  const rate = Math.round((v.rate ?? 0) * 100);
  const cls = rate >= 90 ? 'ok' : rate >= 50 ? 'warn' : 'bad';
  return `<div class="item"><div class="who">${rate >= 100 ? '💯' : rate >= 90 ? '✨' : '🧹'}</div><div class="txt"><p><b>${fmtDate(v.date)}</b> <span class="chip ${cls}">${rate}%</span></p>
    <small>${fmtTime(v.clockIn)} → ${fmtTime(v.clockOut)} · ${fmtDur(v.clockOut - v.clockIn)} · ⭐ ${v.points} · ${fmtMoney(v.pay)}</small>${v.note ? `<p class="muted" style="margin-top:4px">📝 ${esc(v.note)}</p>` : ''}</div></div>`;
}

// ===== Хүсэлт (хоёулаа) =====
function vRequests(d) {
  const list = [...d.requests].reverse();
  const open = list.filter(r => !r.done), done = list.filter(r => r.done).slice(0, 20);
  const row = r => `<div class="item ${r.done ? 'done' : ''}"><div class="who ${r.from}">${r.from === 'mom' ? '👩' : '🧹'}</div><div class="txt"><span class="who-tag ${r.from}">${r.from === 'mom' ? esc(d.settings.momName) : esc(d.settings.cleanerName)}</span><p>${esc(r.text)}</p><small>${fmtDate(new Date(r.createdAt).toLocaleDateString('en-CA', { timeZone: TZ }))} ${fmtTime(r.createdAt)}${r.done ? ' · ✓ хийгдсэн' : ''}</small></div>
    <button class="icbtn" data-reqtoggle="${r.id}" data-done="${r.done ? 0 : 1}" title="${r.done ? 'Буцаах' : 'Хийгдсэн'}">${r.done ? '↩️' : '✅'}</button>${(r.from === S.me || S.me === 'mom') ? `<button class="icbtn" data-reqdel="${r.id}">🗑️</button>` : ''}</div>`;
  return `
    <div class="card"><h3>✍️ ${S.me === 'mom' ? 'Цэвэрлэгчид хүсэлт бичих' : 'Ээжид хүсэлт бичих'}</h3>
      <textarea id="reqtext" placeholder="${S.me === 'mom' ? 'Жишээ: Маргааш хөшгийг угаачих' : 'Жишээ: Угаалгын нунтаг дууссан, авчирна уу'}"></textarea>
      <div style="height:8px"></div><button class="btn" data-act="sendreq">Илгээх 📨</button></div>
    <div class="card"><h3>📌 Хүлээгдэж байгаа (${open.length})</h3>${open.length ? open.map(row).join('') : '<div class="empty"><span>🎈</span>Хүсэлт алга</div>'}</div>
    ${done.length ? `<div class="card"><h3>✅ Хийгдсэн</h3>${done.map(row).join('')}</div>` : ''}`;
}

// ===== Хуваарь (хоёулаа) =====
function vSchedule(d) {
  const today = d.today;
  const items = d.schedule;
  const visitsByDate = Object.groupBy ? Object.groupBy(d.visits, v => v.date) : d.visits.reduce((a, v) => ((a[v.date] ||= []).push(v), a), {});
  return `
    <div class="card"><h3>➕ Ирэх өдөр нэмэх</h3>
      <div class="grid2"><div class="field"><label>Огноо</label><input type="date" id="sd" value="${today}"></div><div class="field"><label>Цаг</label><input type="time" id="st" value="10:00"></div></div>
      <div class="field"><label>Тэмдэглэл</label><input type="text" id="sn" placeholder="Жишээ: ердийн цэвэрлэгээ / цонх угаах өдөр"></div>
      <button class="btn" data-act="addsched">Хуваарьт нэмэх 📅</button></div>
    <div class="card"><h3>📅 Хуваарь</h3>${items.length ? items.map(s => {
      const [, m, dd] = s.date.split('-'); const past = s.date < today, isT = s.date === today;
      const vs = visitsByDate[s.date] || [];
      return `<div class="day ${isT ? 'today' : past ? 'past' : ''}"><div class="d"><b>${Number(dd)}</b><small>${Number(m)}-р сар · ${weekday(s.date)}</small></div><div class="grow"><b>${s.time || 'Цаг тодорхойгүй'}</b> <span class="muted">${esc(s.note || '')}</span><div class="muted">${s.by === 'mom' ? '👩 ээж' : '🧹 цэвэрлэгч'} оруулсан${vs.length ? ` · ✅ ирсэн ${fmtTime(vs[0].clockIn)}` : past ? ' · ❌ ирээгүй' : ''}</div></div><button class="icbtn" data-scheddel="${s.id}">🗑️</button></div>`;
    }).join('') : '<div class="empty"><span>🗓️</span>Хуваарь оруулаагүй байна</div>'}</div>`;
}

// ===== Ээж =====
function vHome(d) {
  const v = d.openVisit, active = d.tasks.filter(t => t.active !== false);
  const done = new Set(v?.done || []); const nDone = active.filter(t => done.has(t.id)).length;
  const closed = d.visits.filter(x => x.clockOut).slice(-7).reverse();
  const cleanerReqs = d.requests.filter(r => r.from === 'cleaner' && !r.done);
  const next = d.schedule.find(s => s.date >= d.today);
  const pr = d.payroll, cur = pr.months[0];
  return `
    <div class="card clock">${v ? `<span class="state live pulse">● ${esc(d.settings.cleanerName)} ажиллаж байна</span><div class="big" id="timer">${fmtClock(Date.now() - v.clockIn)}</div><div class="muted">Ирсэн ${fmtTime(v.clockIn)} · ${nDone}/${active.length} ажил хийсэн</div><div style="height:8px"></div><div class="bar"><i style="width:${active.length ? nDone / active.length * 100 : 0}%"></i></div>`
      : `<span class="state">Одоо гэрт байхгүй</span><div class="big" style="font-size:30px">${next ? `${next.date === d.today ? 'Өнөөдөр' : fmtDate(next.date)} ${next.time || ''}` : 'Хуваарь алга'}</div><div class="muted">${next ? 'дараагийн ирэх өдөр' : 'Хуваарь таб дээр нэмнэ үү'}</div>`}</div>
    <div class="statgrid"><div class="stat"><b>${d.stats.visits}</b><small>айлчлал</small></div><div class="stat"><b>${d.stats.streak}🔥</b><small>дараалан сайн</small></div><div class="stat"><b>${d.stats.level.level}</b><small>${d.stats.level.title}</small></div></div>
    <div style="height:14px"></div>
    <div class="card"><div class="row"><div class="grow"><h3 style="margin:0">💰 ${cur ? fmtMonth(cur.month) : 'Цалин'}</h3><div class="muted">бодогдсон цалин</div></div><div class="money">${fmtMoney(cur?.earned || 0)}</div></div>
      ${pr.balance ? `<div class="muted" style="margin-top:6px">Өгөх үлдэгдэл: <b style="color:${pr.balance > 0 ? 'var(--bad)' : 'var(--ok)'}">${fmtMoney(pr.balance)}</b></div>` : ''}</div>
    ${cleanerReqs.length ? `<div class="card"><h3>💬 Цэвэрлэгчийн хүсэлт</h3>${cleanerReqs.map(r => `<div class="item"><div class="who">🧹</div><div class="txt"><p>${esc(r.text)}</p><small>${fmtTime(r.createdAt)}</small></div><button class="btn sm ok" data-reqdone="${r.id}">Шийдсэн ✓</button></div>`).join('')}</div>` : ''}
    ${d.ai ? `<div class="card"><h3>🤖 AI тойм</h3><div class="row"><input type="text" id="aiq" class="grow" placeholder="Асуулт (хоосон бол 2 долоо хоногийн тойм)"><button class="btn sm" data-act="ai">Асуух</button></div>${S.ai ? `<div class="ai-out" style="margin-top:10px">${esc(S.ai)}</div>` : ''}</div>` : ''}
    <div class="card"><h3>📜 Сүүлийн айлчлалууд</h3>${closed.length ? closed.map(x => visitRow(x, d)).join('') : '<div class="empty"><span>🌱</span>Айлчлал бүртгэгдээгүй</div>'}</div>`;
}
function vTasks(d) {
  const g = groupTasks(d.tasks); const inactive = d.tasks.filter(t => t.active === false);
  return `
    <div class="card"><div class="row"><div class="grow"><h3 style="margin:0">📝 Ажлын жагсаалт</h3><div class="muted">Цэвэрлэгч ирэх бүрт энэ жагсаалтыг чеклэнэ. Оноо = тоглоомын XP.</div></div><button class="btn sm" data-act="newtask">+ Нэмэх</button></div></div>
    ${[...g].map(([room, ts]) => `<div class="room"><h4>${esc(ts[0].icon)} ${esc(room)}</h4>${ts.map(t => `<div class="task" data-edit="${t.id}"><div class="ic">${esc(t.icon)}</div><div class="t">${esc(t.title)}</div><div class="pts">${t.points}</div><span class="muted">✎</span></div>`).join('')}</div>`).join('')}
    ${inactive.length ? `<div class="card"><h3>Идэвхгүй</h3>${inactive.map(t => `<div class="item"><div class="txt"><p class="muted">${esc(t.title)}</p></div><button class="btn sm ghost" data-edit="${t.id}">Засах</button></div>`).join('')}</div>` : ''}
    <div class="card"><h3>👤 Нэрс</h3><div class="grid2"><div class="field"><label>Цэвэрлэгчийн нэр</label><input type="text" id="cn" value="${esc(d.settings.cleanerName)}"></div><div class="field"><label>Таны нэр</label><input type="text" id="mn" value="${esc(d.settings.momName)}"></div></div><button class="btn ghost" data-act="savenames">Хадгалах</button></div>`;
}
function vMoney(d) {
  const pr = d.payroll, st = d.settings;
  return `
    <div class="hero"><div class="row"><div class="grow"><small>Нийт бодогдсон</small><b style="font-size:26px">${fmtMoney(pr.earned)}</b></div><div style="text-align:right"><small>Өгсөн</small><b>${fmtMoney(pr.paid)}</b></div></div>
      <div class="pills"><span class="pill">${pr.balance > 0 ? `Өгөх үлдэгдэл: ${fmtMoney(pr.balance)}` : pr.balance < 0 ? `Урьдчилгаа: ${fmtMoney(-pr.balance)}` : 'Тооцоо тэнцсэн ✓'}</span></div></div>
    <div class="card"><h3>⚙️ Тариф</h3>
      <div class="grid2"><div class="field"><label>Төрөл</label><select id="rt"><option value="hour" ${st.rateType !== 'visit' ? 'selected' : ''}>Цагаар</option><option value="visit" ${st.rateType === 'visit' ? 'selected' : ''}>Айлчлал тутам</option></select></div>
      <div class="field"><label>Тариф (₮)</label><input type="number" id="rate" value="${st.rate}" min="0" step="500"></div></div>
      <div class="field"><label>Оноо тутмын урамшуулал (₮) — тоглоомын оноог мөнгө болгоно, 0 бол байхгүй</label><input type="number" id="bonus" value="${st.bonusPerPoint || 0}" min="0" step="100"></div>
      <div class="muted" style="margin-bottom:8px">Цагаар бол 15 минут тутмаар бөөрөнхийлж бодно. Тариф өөрчлөгдсөн ч өмнөх айлчлалын цалин хэвээр.</div>
      <button class="btn ghost" data-act="saverate">Хадгалах</button></div>
    <div class="card"><h3>📊 Сараар</h3>${pr.months.length ? `<table><tr><th>Сар</th><th class="r">Айлчлал</th><th class="r">Цаг</th><th class="r">Бодогдсон</th><th class="r">Өгсөн</th></tr>${pr.months.map(m => `<tr><td>${fmtMonth(m.month)}</td><td class="r">${m.visits}</td><td class="r">${(m.minutes / 60).toFixed(1)}</td><td class="r"><b>${fmtMoney(m.earned)}</b></td><td class="r">${fmtMoney(m.paid)}</td></tr>`).join('')}</table>` : '<div class="empty"><span>📭</span>Айлчлал бүртгэгдээгүй</div>'}</div>
    <div class="card"><h3>💵 Цалин өгсөн бүртгэл</h3>
      <div class="grid2"><div class="field"><label>Дүн (₮)</label><input type="number" id="pa" placeholder="100000" min="0" step="1000"></div><div class="field"><label>Огноо</label><input type="date" id="pd" value="${d.today}"></div></div>
      <div class="field"><input type="text" id="pn" placeholder="Тэмдэглэл (сонголттой)"></div>
      <button class="btn" data-act="addpay">Өгсөн гэж бүртгэх</button>
      <div style="height:8px"></div>
      ${[...(d.payments || [])].reverse().map(p => `<div class="item"><div class="who">💵</div><div class="txt"><p><b>${fmtMoney(p.amount)}</b> ${esc(p.note || '')}</p><small>${fmtDate(p.date)}</small></div><button class="icbtn" data-paydel="${p.id}">🗑️</button></div>`).join('')}</div>`;
}

// ---------- sheets ----------
function renderSheet(d) {
  const sh = S.sheet;
  if (sh.type === 'task') {
    const t = sh.task || { title: '', room: '', points: 10, icon: '🧽', active: true };
    const rooms = [...new Set(d.tasks.map(x => x.room))];
    return `<div class="sheet-bg" data-close="1"><div class="sheet"><h3>${t.id ? 'Ажил засах' : 'Шинэ ажил'}</h3>
      <div class="field"><label>Нэр</label><input type="text" id="tt" value="${esc(t.title)}" placeholder="Жишээ: Хивс соруулах"></div>
      <div class="grid2"><div class="field"><label>Өрөө</label><input type="text" id="tr" list="rooms" value="${esc(t.room)}" placeholder="Гал тогоо"><datalist id="rooms">${rooms.map(r => `<option value="${esc(r)}">`).join('')}</datalist></div>
      <div class="field"><label>Оноо</label><input type="number" id="tp" value="${t.points}" min="1" max="100"></div></div>
      <div class="field"><label>Дүрс (emoji)</label><input type="text" id="ti" value="${esc(t.icon)}" maxlength="4"></div>
      ${t.id ? `<div class="field"><label><input type="checkbox" id="ta" ${t.active !== false ? 'checked' : ''}> Идэвхтэй (жагсаалтад харагдана)</label></div>` : ''}
      <button class="btn" data-act="savetask">Хадгалах</button>
      ${t.id ? `<div style="height:8px"></div><button class="btn ghost" data-act="deltask" style="color:var(--bad)">Устгах</button>` : ''}</div></div>`;
  }
  if (sh.type === 'clockout') {
    const v = d.openVisit, active = d.tasks.filter(t => t.active !== false), done = new Set(v?.done || []);
    const skipped = active.filter(t => !done.has(t.id));
    return `<div class="sheet-bg" data-close="1"><div class="sheet"><h3>🏁 Ажил дуусгах</h3>
      <div class="muted">Ажилласан: <b>${fmtDur(Date.now() - v.clockIn)}</b> · ${active.length - skipped.length}/${active.length} ажил · ⭐ ${v.points} оноо</div>
      ${skipped.length ? `<div class="card" style="margin:10px 0;background:#fef3c7;color:#92400e;box-shadow:none"><b>Хийгдээгүй ${skipped.length}:</b> ${skipped.map(t => esc(t.title)).join(', ')}</div>` : '<div class="card" style="margin:10px 0;background:#d1fae5;color:#065f46;box-shadow:none">💯 Бүх ажил хийгдсэн!</div>'}
      <div class="field"><label>Ээжид тэмдэглэл (сонголттой)</label><textarea id="outnote" placeholder="Жишээ: Цонхыг маргааш угаана, бороотой байсан"></textarea></div>
      <button class="btn out" data-act="clockout2">Явлаа ✓</button></div></div>`;
  }
  return '';
}

// ---------- events ----------
let busy = false;
async function act(fn) { if (busy) return; busy = true; try { await fn(); } catch (e) { if (e.message !== 'auth') console.error(e); } finally { busy = false; } }

app.addEventListener('click', e => {
  const el = e.target.closest('[data-role],[data-key],[data-tab],[data-act],[data-task],[data-reqdone],[data-reqtoggle],[data-reqdel],[data-scheddel],[data-edit],[data-paydel],[data-close]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.close && e.target !== el) return; // click inside sheet
  if (ds.close) { S.sheet = null; return render(); }
  if (ds.role) { S.role = ds.role; S.err = ''; return render(); }
  if (ds.key !== undefined) return pinKey(ds.key);
  if (ds.tab) { S.tab = ds.tab; return render(); }
  if (ds.task) return act(() => toggleTask(ds.task, el));
  if (ds.reqdone) return act(async () => { await api('/api/requests/done', { id: ds.reqdone, done: true }); toast('Хийгдсэн гэж тэмдэглэв ✓'); await load(); });
  if (ds.reqtoggle) return act(async () => { await api('/api/requests/done', { id: ds.reqtoggle, done: ds.done === '1' }); await load(); });
  if (ds.reqdel) return act(async () => { if (!confirm('Хүсэлтийг устгах уу?')) return; await api('/api/requests/delete', { id: ds.reqdel }); await load(); });
  if (ds.scheddel) return act(async () => { if (!confirm('Хуваариас хасах уу?')) return; await api('/api/schedule/delete', { id: ds.scheddel }); await load(); });
  if (ds.paydel) return act(async () => { if (!confirm('Бүртгэлийг устгах уу?')) return; await api('/api/payments/delete', { id: ds.paydel }); await load(); });
  if (ds.edit) { S.sheet = { type: 'task', task: S.data.tasks.find(t => t.id === ds.edit) }; return render(); }
  if (ds.act) return act(() => actions[ds.act]());
});

const actions = {
  logout: async () => { await api('/api/logout', {}); S.me = null; S.data = null; S.pin = ''; render(); },
  clockin: async () => { await api('/api/clock', { action: 'in' }); toast('Амжилттай! Сайн ажиллаарай 💪'); await load(); },
  clockout: () => { S.sheet = { type: 'clockout' }; render(); },
  clockout2: async () => {
    const note = $('#outnote')?.value || '';
    const r = await api('/api/clock', { action: 'out', note });
    S.sheet = null;
    await load();
    const rate = r.visit.rate || 0;
    if (rate >= 0.9) { confetti(180); toast(rate >= 1 ? `💯 Төгс өдөр! +${r.visit.points} XP · ${fmtMoney(r.visit.pay)}` : `✨ Сайн ажиллалаа! +${r.visit.points} XP · ${fmtMoney(r.visit.pay)}`, 4000); }
    else toast(`Баяртай! +${r.visit.points} XP · ${fmtMoney(r.visit.pay)}`, 3500);
  },
  sendreq: async () => {
    const t = $('#reqtext').value.trim(); if (!t) return toast('Хүсэлтээ бичнэ үү');
    await api('/api/requests', { text: t }); toast('Илгээлээ 📨'); await load();
  },
  addsched: async () => {
    const date = $('#sd').value, time = $('#st').value, note = $('#sn').value;
    if (!date) return toast('Огноо сонгоно уу');
    await api('/api/schedule', { date, time, note }); toast('Хуваарьт нэмэв 📅'); await load();
  },
  newtask: () => { S.sheet = { type: 'task', task: null }; render(); },
  savetask: async () => {
    const t = S.sheet.task || {};
    await api('/api/tasks/save', { id: t.id, title: $('#tt').value, room: $('#tr').value, points: $('#tp').value, icon: $('#ti').value, active: $('#ta') ? $('#ta').checked : true });
    S.sheet = null; toast('Хадгалав ✓'); await load();
  },
  deltask: async () => { if (!confirm('Энэ ажлыг устгах уу?')) return; await api('/api/tasks/delete', { id: S.sheet.task.id }); S.sheet = null; await load(); },
  savenames: async () => { await api('/api/settings', { cleanerName: $('#cn').value, momName: $('#mn').value }); toast('Хадгалав ✓'); await load(); },
  saverate: async () => { await api('/api/settings', { rateType: $('#rt').value, rate: $('#rate').value, bonusPerPoint: $('#bonus').value }); toast('Тариф хадгалав ✓'); await load(); },
  addpay: async () => {
    const amount = Number($('#pa').value); if (!(amount > 0)) return toast('Дүнгээ оруулна уу');
    await api('/api/payments', { amount, date: $('#pd').value, note: $('#pn').value }); toast('Бүртгэв ✓'); await load();
  },
  ai: async () => {
    const q = $('#aiq').value; S.ai = '⏳ Бодож байна…'; render();
    try { const r = await api('/api/ai/summary', { question: q }); S.ai = r.text; } catch (e) { S.ai = ''; }
    render();
  },
};

async function toggleTask(id, el) {
  if (!S.data.openVisit) return toast('Эхлээд «Ирлээ» дарна уу 👋');
  const wasDone = el.classList.contains('done');
  el.classList.toggle('done'); el.classList.add('pop');  // optimistic
  const r = await api('/api/visit/task', { taskId: id, done: !wasDone });
  S.data.openVisit = r.visit;
  const active = S.data.tasks.filter(t => t.active !== false);
  if (!wasDone && active.every(t => r.visit.done.includes(t.id))) { confetti(200); toast('🎉 Бүх ажил дууслаа! Одоо «Явлаа» дар', 4000); }
  else if (!wasDone) { const t = S.data.tasks.find(t => t.id === id); toast(`+${t.points} оноо ⭐`, 1200); }
  render();
}

async function pinKey(k) {
  if (k === '⌫') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 4) S.pin += k;
  S.err = ''; render();
  if (S.pin.length === 4) {
    try { await api('/api/login', { role: S.role, pin: S.pin }); S.pin = ''; S.tab = S.role === 'mom' ? 'home' : 'today'; await load(); }
    catch (e) { S.pin = ''; S.err = e.message === '401' ? 'PIN буруу байна' : (e.message || 'Алдаа'); if (navigator.vibrate) navigator.vibrate(100); render(); }
  }
}

// timer tick + periodic refresh
setInterval(() => { const t = $('#timer'); if (t && S.data?.openVisit) t.textContent = fmtClock(Date.now() - S.data.openVisit.clockIn); }, 1000);
setInterval(() => { if (S.me && !S.sheet && document.visibilityState === 'visible') load(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me) load(); });

load();
})();
