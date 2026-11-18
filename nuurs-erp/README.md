# Нүүрс ERP

Web ERP for a Mongolian coal-trucking company: the profit of every trip, document intake from
photos with accountant approval, and fuel-norm control. Built from the "Nuurs ERP — Claude Code
build specification". This is **Phase 1 (Foundation)**.

> Temporary home: this folder lives inside the `Fitness` repository until its own `nuurs-erp`
> repository exists. It is self-contained and can be moved as is.

## Run locally

Needs Node 22 and PostgreSQL 16.

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npm run setup                 # apply migrations + seed the demo company
npm run dev                   # http://localhost:3000
```

Demo logins (seeded from the Сүндэр Ложистик ХХК report):

| Role | Phone | Password |
|---|---|---|
| Захирал (director) | 99000001 | demo1234 |
| Нягтлан (accountant) | 99000002 | demo1234 |
| Менежер (manager) | 99000003 | demo1234 |
| Талбайн менежер (site manager) | 99000004 | demo1234 |
| Жолооч (driver) | 99112233 … 99112237 | PIN 1234 |

## Environment variables

| Name | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FILES_DIR` | Folder for original photos and scans (written once, never changed) |
| `VISION_PROVIDER` | `mock` (default, returns the sample ticket for any photo) or `claude` |
| `ANTHROPIC_API_KEY` | Needed when `VISION_PROVIDER=claude` |
| `VISION_MODEL` | Model name for extraction; kept out of the code on purpose |
| `SESSION_DAYS` | Login lifetime, default 14 |

## Tests

```bash
npm test                      # unit tests: revenue, fuel norm, fuel→trip, weights, permissions, extraction
npm run typecheck
# End-to-end acceptance checks against a freshly seeded server with VISION_PROVIDER=mock:
BASE_URL=http://localhost:3000 node e2e/phase1.e2e.mjs
```

## How the money is computed

All of it lives in `src/lib/calc` (pure functions, unit-tested). UI code never computes money.

- **Revenue** = billable weight (tonnes) × contract rate. Billable weight is the unloading
  weighbridge weight by default. The rate is the one **in force on the trip's loading date**:
  contract rates are kept as a history (Цагаан залаат: 115 CNY/t in October, 120 from November).
- **Currency**: rates are in CNY, converted with the exchange-rate history (540 ₮/CNY seeded).
- **Fuel cost**: receipt price → else the station's price (Нагааранз ШТС 9.007 CNY/L) → else the
  company default 6 000 ₮/L. The last two are marked *ойролцоо* (estimate).
- **Ахиуц (margin)** = revenue − fuel cost. Not a profit: pay, repairs, tyres and insurance are left out.
  **Profit** = revenue − fuel − driver pay − other trip costs (pay arrives in Phase 3).
- **Fuel → trip**: fuel bought before or during a trip belongs to it; fuel between two trips belongs
  to the trip that starts next; fuel after the tractor's last unloading is *pending* (its trip is
  not registered yet). Fuel with no plate, and fuel of a tractor with no trips, are listed for review.
- **Fuel norm**: per trip by loading date — 600 L, 650 L from 2026-11-01 (winter). The «Түлш» page
  compares each tractor's fuel with its trips' norm, as in the monthly report.

## What Phase 1 contains

- Login by phone + password (drivers: PIN), five roles, every permission checked on the server
  (`src/lib/auth/permissions.ts`).
- Photo upload (office and driver page) → stored first, de-duplicated by SHA-256 → read by the
  vision model → pending weighbridge ticket or fuel entry. Failed reads can be re-run.
- Approval queue: photo beside the fields, low-confidence fields highlighted, weight arithmetic
  checked; approve / edit-then-approve / reject. Only the accountant approves. Editing an approved
  ticket needs a reason and is written to the change log.
- Trips: created by the manager or automatically from an approved ticket when the rig has no open
  trip (marked *авто* for the manager to confirm the contract); closing freezes the numbers.
- Dashboard (manager's version hides money), fuel-norm report, fleet with insurance policies and
  expiry warnings, contracts with rate history, phone-first driver page.

## Not yet (later phases, per the spec)

WeChat bot ingest and fuel-photo pairing (Phase 2), audit rules, maintenance/tyres/HR/payroll/letters
and Excel export (Phase 3), GPS (Phase 4), customs (Phase 5). Object storage (R2/S3) plugs into
`src/lib/storage`. Extraction runs inline after upload; a database job queue replaces it in Phase 2.
