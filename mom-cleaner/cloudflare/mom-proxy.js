// mom.sonorgroup.mn → Railway (mom service). Railway-ийн custom-domain router энэ домэйнийг
// таниагүй тул Cloudflare Worker ажиллаж байгаа service domain руу proxy хийнэ.
const ORIGIN = 'mom-production-b950.up.railway.app';
export default {
  async fetch(req) {
    const url = new URL(req.url);
    url.protocol = 'https:'; url.hostname = ORIGIN; url.port = '';
    const h = new Headers(req.headers);
    h.set('X-Real-IP', req.headers.get('cf-connecting-ip') || '');
    h.set('X-Forwarded-Host', 'mom.sonorgroup.mn');
    h.set('X-Forwarded-Proto', 'https');
    // Cloudflare кэшийг тойрно: апп өөрөө Cache-Control тавьдаг, кэшлэгдсэн хуучин app.js үлдэхгүй.
    const init = { method: req.method, headers: h, redirect: 'manual', cache: 'no-store' };
    // Body-г бүтнээр нь уншиж дамжуулна (chunked stream биш) — зарим клиентийн POST найдвартай хүрнэ.
    if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = await req.arrayBuffer(); h.delete('content-length'); h.delete('transfer-encoding'); }
    let res;
    try { res = await fetch(url.toString(), init); }
    catch (e) { return new Response(JSON.stringify({ error: 'upstream: ' + e.message }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } }); }
    const out = new Headers(res.headers);
    const loc = out.get('location');
    if (loc) out.set('location', loc.replace(ORIGIN, 'mom.sonorgroup.mn'));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  },
};
