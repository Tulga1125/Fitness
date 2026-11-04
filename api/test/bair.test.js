/* Bair Hunt's shared apartment list (bair.js, GET/POST /api/bair): the PIN gates every call, a
   wrong PIN is throttled hard, one change never undoes another, and the list survives a restart.
   Real server.js in a child, same harness as server-admin-delete.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { cleanItem, pinMatches } from '../bair.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startServer(t, { dataDir, env = {} } = {}) {
  dataDir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'gym-bair-'));
  if (!fs.existsSync(path.join(dataDir, 'secret'))) fs.writeFileSync(path.join(dataDir, 'secret'), 'b'.repeat(64), { mode: 0o600 });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', BAIR_PIN: '4321', ...env },
  });
  const h = { log: '', dataDir, child };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => child.kill('SIGKILL'));
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}/api/bair`;
  h.call = async (method, body, pin = '4321', extra = {}) => {
    const headers = { ...(pin != null ? { Authorization: `Bearer ${pin}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra };
    const r = await fetch(h.api, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return h;
}

test('the PIN opens the list; a missing or wrong one does not', async t => {
  const h = await startServer(t);
  assert.equal((await h.call('GET', null, null)).status, 401);
  assert.equal((await h.call('GET', null, '0000')).status, 401);
  const ok = await h.call('GET');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.items, []);
  assert.equal((await h.call('POST', { op: 'set', item: { id: 'a', name: 'X' } }, '0000')).status, 401);
});

test('set, delete and import change one thing at a time and persist across a restart', async t => {
  const h = await startServer(t);
  let r = await h.call('POST', { op: 'set', item: { id: 'a', name: 'Ривер', price: 320 } });
  assert.equal(r.status, 200);
  r = await h.call('POST', { op: 'import', items: [{ id: 'b', name: 'Two' }, { id: 'c', name: 'Three' }] });
  assert.deepEqual(r.body.items.map(i => i.id).sort(), ['a', 'b', 'c']);
  // A second device changing "b" leaves "a" exactly as the first device saved it.
  r = await h.call('POST', { op: 'set', item: { id: 'b', name: 'Two, edited' } });
  assert.equal(r.body.items.find(i => i.id === 'a').price, 320);
  r = await h.call('POST', { op: 'delete', id: 'c' });
  assert.deepEqual(r.body.items.map(i => i.id).sort(), ['a', 'b']);
  assert.equal(r.body.rev, 4);

  h.child.kill('SIGKILL');
  const again = await startServer(t, { dataDir: h.dataDir });
  r = await again.call('GET');
  assert.deepEqual(r.body.items.map(i => i.name).sort(), ['Two, edited', 'Ривер']);
});

test('the map key goes out with the list, and only to the PIN', async t => {
  const h = await startServer(t, { env: { BAIR_MAP_KEY: 'test-map-key' } });
  const got = (await h.call('GET')).body;
  assert.equal(got.mapKey, 'test-map-key');
  assert.equal(got.build.mapKey, true);
  assert.ok(got.build.vars.includes('"BAIR_MAP_KEY"'));
  assert.ok(!JSON.stringify(got.build).includes('test-map-key'), 'build never carries a value');
  const spaced = await startServer(t, { env: { 'bair_map_key ': 'spaced-key' } });
  assert.equal((await spaced.call('GET')).body.mapKey, 'spaced-key');
  const quoted = await startServer(t, { env: { BAIR_MAP_KEY: '"quoted-key"' } });
  assert.equal((await quoted.call('GET')).body.mapKey, 'quoted-key');
  const wrong = await h.call('GET', null, '0000');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.mapKey, undefined);
  assert.equal((await h.call('POST', { op: 'set', item: { id: 'a' } })).body.mapKey, undefined);
  const none = await startServer(t);
  assert.equal('mapKey' in (await none.call('GET')).body, false);
});

test('a malformed change is refused and changes nothing', async t => {
  const h = await startServer(t);
  for (const body of [{ op: 'nope' }, { op: 'set', item: { name: 'no id' } }, { op: 'set', item: { id: '../x' } }, { op: 'import', items: 'x' }, { op: 'set', item: { id: 'big', s: 'x'.repeat(40000) } }]) {
    const r = await h.call('POST', body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.deepEqual((await h.call('GET')).body.items, []);
});

test('a page on another site can call it with the PIN (Bearer skips the origin check)', async t => {
  const h = await startServer(t);
  const r = await h.call('POST', { op: 'set', item: { id: 'x' } }, '4321', { Origin: 'https://tagent.space', 'Sec-Fetch-Site': 'same-site' });
  assert.equal(r.status, 200);
});

test('wrong PINs pause the address, even for the right PIN', async t => {
  const h = await startServer(t);
  for (let i = 0; i < 6; i++) await h.call('GET', null, String(1000 + i));
  const r = await h.call('GET');
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'locked');
});

test('without BAIR_PIN, or with BAIR_PIN=off, the routes are off', async t => {
  const off = await startServer(t, { env: { BAIR_PIN: 'off' } });
  assert.equal((await off.call('GET')).status, 404);
  const unset = await startServer(t, { env: { BAIR_PIN: '' } });
  assert.equal((await unset.call('GET')).status, 404);
});

test('helpers: the PIN check and the item check', () => {
  assert.equal(pinMatches('Bearer 2468', '2468'), true);
  assert.equal(pinMatches('Bearer 2469', '2468'), false);
  assert.equal(pinMatches('2468', '2468'), false);
  assert.equal(pinMatches('Bearer 2468', ''), false);
  assert.equal(typeof cleanItem([]), 'string');
  assert.deepEqual(cleanItem({ id: 'ok-1', a: 1 }), { id: 'ok-1', a: 1 });
});
