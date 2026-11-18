// Phase 1 acceptance checks against a running, freshly seeded server with VISION_PROVIDER=mock.
//   BASE_URL=http://localhost:3100 SHOTS=./shots node e2e/phase1.e2e.mjs
// The mock extractor returns the sample unloading ticket for any photo.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}\n    ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
}
async function session(phone, password) {
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=phone]", phone);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return page;
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

// Any image works with the mock; make a small PNG by screenshotting a blank page.
const tmp = await browser.newPage();
await tmp.setContent("<div style='width:300px;height:200px;background:#eee;font:20px sans-serif'>ticket photo</div>");
const photo = { name: "ticket.png", mimeType: "image/png", buffer: await tmp.screenshot() };
await tmp.close();

const acc = await session("99000002", "demo1234");
let ticketUrl;

await check("upload creates a pending ticket with the sample's values; the contract number is flagged", async () => {
  await acc.goto(`${BASE}/upload`);
  await acc.setInputFiles("input[name=photos]", photo);
  await Promise.all([acc.waitForURL(/stored=1/), acc.click("button:has-text('Оруулах')")]);
  await acc.goto(`${BASE}/approvals`);
  await Promise.all([acc.waitForURL(/\/approvals\/ticket\//), acc.click("a[href^='/approvals/ticket/']")]);
  ticketUrl = acc.url();
  const val = (n) => acc.inputValue(`[name=${n}]`);
  assert.equal(await val("ticketNo"), "11260039412");
  assert.equal(await val("weightInKg"), "197000");
  assert.equal(await val("weightOutKg"), "46950");
  assert.equal(await val("netKg"), "150050");
  assert.equal(await val("trailer1"), "1234ЧА");
  assert.equal(await val("trailer2"), "1235ЧА");
  assert.match((await acc.getAttribute("[name=contractNoRaw]", "class")) ?? "", /low/);
  await shot(acc, "1-approval-review");
});

await check("a pending ticket changes no trip until it is approved", async () => {
  assert.ok(await acc.isVisible("text=батлахад автоматаар холбоно"));
});

await check("a manager sees the ticket but cannot approve it", async () => {
  const mgr = await session("99000003", "demo1234");
  await mgr.goto(ticketUrl);
  assert.ok(await mgr.isVisible("text=Зөвхөн нягтлан батална."));
  assert.equal(await mgr.locator("button[value=approve]").count(), 0);
  // The manager's pages hide money.
  await mgr.goto(`${BASE}/`);
  assert.equal(await mgr.locator("text=Орлого").count(), 0);
  await mgr.context().close();
});

await check("after approval the trip revenue equals billable tonnes × contract rate (150.05 × 115 × 540)", async () => {
  await Promise.all([acc.waitForURL(`${BASE}/approvals`), acc.click("button[value=approve]")]);
  await acc.goto(ticketUrl);
  await Promise.all([acc.waitForURL(/\/trips\//), acc.click("a[href^='/trips/']")]);
  const expected = Math.round(150.05 * 115 * 540).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  assert.ok(await acc.isVisible(`text=${expected} ₮`), `expected ${expected} ₮ on the trip page`);
  await shot(acc, "2-trip");
});

await check("the same photo sent twice creates one record", async () => {
  await acc.goto(`${BASE}/upload`);
  await acc.setInputFiles("input[name=photos]", photo);
  await Promise.all([acc.waitForURL(/dup=1/), acc.click("button:has-text('Оруулах')")]);
  assert.match(acc.url(), /stored=0/);
});

await check("a policy ending in 7 days shows in the dashboard warnings", async () => {
  const dir = await session("99000001", "demo1234");
  await dir.goto(`${BASE}/`);
  const row = dir.locator("tr", { hasText: "3341ӨМН" });
  assert.ok(await row.isVisible());
  await shot(dir, "3-dashboard");
  await dir.goto(`${BASE}/fuel?month=2026-11`);
  assert.ok(await dir.isVisible("text=Рейсгүй атлаа түлш авсан"));
  assert.ok(await dir.isVisible("text=Сүүлийн буулгалтаас хойш"));
  await shot(dir, "4-fuel");
  await dir.context().close();
});

await check("a driver sees only their own trips and cannot open office pages or others' photos", async () => {
  const drv = await session("99112234", "1234");
  assert.match(drv.url(), /\/driver/);
  const rows = await drv.locator("tbody tr").count();
  assert.equal(rows, 2, "Д.Ганболд has two seeded trips");
  await drv.goto(`${BASE}/trips`);
  assert.match(drv.url(), /\/driver/);
  const fileId = await acc.goto(ticketUrl).then(() => acc.getAttribute(".photo img", "src"));
  const res = await drv.request.get(`${BASE}${fileId}`);
  assert.equal(res.status(), 403);
  await drv.setViewportSize({ width: 390, height: 844 });
  await shot(drv, "5-driver-phone");
  await drv.context().close();
});

await browser.close();
console.log(results.join("\n"));
