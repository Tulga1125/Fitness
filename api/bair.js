/* Bair Hunt: the apartment-search log served at tagent.space/bair/ keeps its list here, so the
 * same list shows on every device instead of living in one browser.
 *
 * One small JSON file under DATA_DIR (bair.json), written whole with the same durable
 * temp-and-rename as everything else here. There are no accounts: one PIN opens the list, sent
 * as `Authorization: Bearer <pin>`. A header, not a cookie, so no other site can borrow it, and
 * the CSRF check in server.js already lets Bearer requests through. The PIN is the BAIR_PIN
 * environment variable; unset (or `off`) the routes are 404s. The PIN is short, so wrong answers are throttled hard
 * per address (server.js, BAIR_FAILS).
 *
 * The page sends one change at a time (set one apartment, delete one, or import several), never
 * the whole list, so two devices editing different apartments never undo each other. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BAIR_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
export const BAIR_MAX_ITEMS = 2000;
export const BAIR_MAX_ITEM_BYTES = 32 * 1024;

const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest();

/** Whether `header` (the request's Authorization value) carries `pin`. Constant-time. */
export function pinMatches(header, pin) {
  const m = /^Bearer\s+(.+)$/.exec(String(header || ''));
  if (!m || !pin) return false;
  return crypto.timingSafeEqual(sha(m[1].trim()), sha(pin));
}

/** A checked copy of one apartment, or a string saying what is wrong with it. */
export function cleanItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'item must be an object';
  if (typeof item.id !== 'string' || !BAIR_ID_RE.test(item.id)) return 'item.id must be 1-80 letters, digits or _ . : -';
  let text;
  try { text = JSON.stringify(item); } catch { return 'item is not plain JSON'; }
  if (Buffer.byteLength(text, 'utf8') > BAIR_MAX_ITEM_BYTES) return 'item is too large';
  return JSON.parse(text);
}

export function createBairStore({ dir, write, now = () => new Date().toISOString() }) {
  const file = path.join(dir, 'bair.json');
  let doc = { v: 1, rev: 0, updatedAt: null, items: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object') doc = { ...doc, ...raw };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Kept aside, never overwritten: the list is the user's own notes.
      const aside = `${file}.unreadable-${Date.now()}`;
      try { fs.copyFileSync(file, aside); } catch { /* nothing more to do */ }
      console.error(`bair.json cannot be read (${e.message}); kept a copy as ${path.basename(aside)}`);
    }
  }
  const view = () => ({ items: Object.values(doc.items), rev: doc.rev, updatedAt: doc.updatedAt });
  function save() {
    doc.rev += 1;
    doc.updatedAt = now();
    write(file, JSON.stringify(doc), 0o600);
  }
  return {
    view,
    /** Applies one change from the page. Returns the new view, or { error } with nothing changed. */
    apply(body) {
      const op = body && body.op;
      if (op === 'set') {
        const it = cleanItem(body.item);
        if (typeof it === 'string') return { error: it };
        if (!doc.items[it.id] && Object.keys(doc.items).length >= BAIR_MAX_ITEMS) return { error: 'the list is full' };
        doc.items[it.id] = it;
      } else if (op === 'delete') {
        if (typeof body.id !== 'string' || !BAIR_ID_RE.test(body.id)) return { error: 'id is missing' };
        if (!doc.items[body.id]) return view();
        delete doc.items[body.id];
      } else if (op === 'import') {
        if (!Array.isArray(body.items)) return { error: 'items must be a list' };
        const clean = [];
        for (const raw of body.items) {
          const it = cleanItem(raw);
          if (typeof it === 'string') return { error: it };
          clean.push(it);
        }
        const ids = new Set([...Object.keys(doc.items), ...clean.map(it => it.id)]);
        if (ids.size > BAIR_MAX_ITEMS) return { error: 'the list is full' };
        if (!clean.length) return view();
        for (const it of clean) doc.items[it.id] = it;
      } else {
        return { error: 'op must be set, delete or import' };
      }
      save();
      return view();
    }
  };
}
