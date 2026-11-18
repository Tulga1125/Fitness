import { describe, expect, it } from "vitest";
import {
  assignFuelToTrips,
  checkTicketWeights,
  fuelCost,
  rateMismatchAmount,
  tripFinancials,
  tripRevenue,
  ubDate,
  ubMidnight,
  valueAt,
  vehicleNormReport,
  weightLoss,
  type ContractTerms,
  type FuelEntry,
  type FxTable,
  type TripSpan,
} from "./index";

const fx: FxTable = { CNY: [{ validFrom: "2026-01-01", value: 540 }] };
const at = (s: string) => new Date(s); // ISO with +08:00 offset

describe("dates", () => {
  it("uses the Ulaanbaatar calendar day", () => {
    expect(ubDate(at("2026-10-31T23:30:00+08:00"))).toBe("2026-10-31");
    expect(ubDate(at("2026-10-31T16:30:00Z"))).toBe("2026-11-01"); // 00:30 in UB
    expect(ubMidnight("2026-11-01").toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });
});

describe("dated values", () => {
  const norms = [
    { validFrom: "2026-01-01", value: 600 },
    { validFrom: "2026-11-01", value: 650 },
  ];
  it("picks the value in force on the day", () => {
    expect(valueAt(norms, at("2026-10-31T22:00:00+08:00"))).toBe(600);
    expect(valueAt(norms, at("2026-11-01T01:00:00+08:00"))).toBe(650);
    expect(valueAt(norms, at("2025-12-31T12:00:00+08:00"))).toBeNull();
  });
});

describe("weighbridge ticket", () => {
  it("accepts the sample unloading ticket", () => {
    expect(checkTicketWeights({ kind: "UNLOAD", weightInKg: 197000, weightOutKg: 46950, netKg: 150050 })).toEqual({ ok: true });
  });
  it("rejects a net weight that does not match in − out", () => {
    const r = checkTicketWeights({ kind: "UNLOAD", weightInKg: 197000, weightOutKg: 46950, netKg: 150500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.expectedNetKg).toBe(150050);
  });
  it("uses out − in at loading", () => {
    expect(checkTicketWeights({ kind: "LOAD", weightInKg: 46950, weightOutKg: 197000, netKg: 150050 }).ok).toBe(true);
  });
  it("computes weight loss", () => {
    const l = weightLoss(150800, 150050);
    expect(l.kg).toBe(750);
    expect(l.percent).toBeCloseTo(0.497, 3);
  });
});

describe("trip revenue", () => {
  const tsagaanZalaat: ContractTerms = {
    rateType: "PER_TONNE",
    currency: "CNY",
    billableWeightBasis: "UNLOADED",
    rates: [
      { validFrom: "2026-10-01", value: 115 },
      { validFrom: "2026-11-01", value: 120 },
    ],
  };
  const trip = (loaded: string) => ({
    loadedAt: at(loaded),
    unloadedAt: at(loaded),
    loadedNetKg: 150800,
    unloadedNetKg: 150050,
  });

  it("is unloaded tonnes × the rate in force on the loading date", () => {
    expect(tripRevenue(tsagaanZalaat, trip("2026-10-20T10:00:00+08:00"))?.amount).toBeCloseTo(150.05 * 115, 6);
    expect(tripRevenue(tsagaanZalaat, trip("2026-11-05T10:00:00+08:00"))?.amount).toBeCloseTo(150.05 * 120, 6);
  });
  it("can bill the loaded weight", () => {
    const r = tripRevenue({ ...tsagaanZalaat, billableWeightBasis: "LOADED" }, trip("2026-11-05T10:00:00+08:00"));
    expect(r?.amount).toBeCloseTo(150.8 * 120, 6);
  });
  it("supports per tonne-km and per trip", () => {
    const t = trip("2026-11-05T10:00:00+08:00");
    expect(tripRevenue({ ...tsagaanZalaat, rateType: "PER_TONNE_KM", distanceKm: 10 }, t)?.amount).toBeCloseTo(150.05 * 10 * 120, 6);
    expect(tripRevenue({ ...tsagaanZalaat, rateType: "PER_TRIP" }, t)?.amount).toBe(120);
  });
  it("is null before any rate starts or without a weight", () => {
    expect(tripRevenue(tsagaanZalaat, trip("2026-09-20T10:00:00+08:00"))).toBeNull();
    expect(tripRevenue(tsagaanZalaat, { ...trip("2026-11-05T10:00:00+08:00"), unloadedNetKg: null })).toBeNull();
  });
  it("matches the October report: 69 trips, 8 596 600 kg at 115 instead of 120 ≈ 42 983 CNY", () => {
    expect(rateMismatchAmount(8_596_600, 115, 120)).toBeCloseTo(42_983, 6);
  });
});

describe("fuel cost", () => {
  const base: FuelEntry = { id: "f1", tractorId: "t1", filledAt: at("2026-11-10T08:00:00+08:00"), litres: 650, unitPrice: null, currency: null };
  it("uses the receipt price, converted from CNY", () => {
    // Нагааранз: 9.007 CNY/L × 540 ₮
    expect(fuelCost({ ...base, unitPrice: 9.007, currency: "CNY" }, fx, 6000)).toEqual({ mnt: 3_161_457, estimated: false, source: "receipt" });
  });
  it("falls back to the station price, then 6 000 ₮/L, marked as estimates", () => {
    expect(fuelCost({ ...base, stationPrice: { price: 9.007, currency: "CNY" } }, fx, 6000)).toMatchObject({ estimated: true, source: "station" });
    expect(fuelCost(base, fx, 6000)).toEqual({ mnt: 3_900_000, estimated: true, source: "default" });
  });
});

describe("fuel to trips", () => {
  const trips: TripSpan[] = [
    { id: "A", tractorId: "t1", startedAt: null, loadedAt: at("2026-11-01T10:00:00+08:00"), unloadedAt: at("2026-11-03T10:00:00+08:00") },
    { id: "B", tractorId: "t1", startedAt: null, loadedAt: at("2026-11-05T10:00:00+08:00"), unloadedAt: at("2026-11-07T10:00:00+08:00") },
  ];
  const e = (id: string, tractorId: string | null, when: string, litres = 650): FuelEntry => ({
    id, tractorId, filledAt: at(when), litres, unitPrice: null, currency: null,
  });

  it("puts fuel during a trip, or between trips, on the trip that runs or starts next", () => {
    const a = assignFuelToTrips(
      [e("before", "t1", "2026-10-31T09:00:00+08:00"), e("during", "t1", "2026-11-02T09:00:00+08:00"), e("between", "t1", "2026-11-04T09:00:00+08:00")],
      trips,
    );
    expect(a.byTrip.get("A")).toEqual(["before", "during"]);
    expect(a.byTrip.get("B")).toEqual(["between"]);
  });
  it("keeps fuel after the last unloading as pending, and separates no-plate and no-trip fuel", () => {
    const a = assignFuelToTrips(
      [e("after", "t1", "2026-11-08T09:00:00+08:00"), e("noplate", null, "2026-10-29T09:00:00+08:00", 100), e("idle", "t9", "2026-11-14T09:00:00+08:00", 400)],
      trips,
    );
    expect(a.pending.map((x) => x.id)).toEqual(["after"]);
    expect(a.unassigned.map((x) => x.id)).toEqual(["noplate"]);
    expect(a.noTrip.map((x) => x.id)).toEqual(["idle"]);
  });
  it("lets an open trip (not unloaded) take fuel bought during it", () => {
    const open: TripSpan[] = [{ id: "C", tractorId: "t2", startedAt: null, loadedAt: at("2026-11-10T10:00:00+08:00"), unloadedAt: null }];
    expect(assignFuelToTrips([e("x", "t2", "2026-11-11T09:00:00+08:00")], open).byTrip.get("C")).toEqual(["x"]);
  });
});

describe("vehicle norm report", () => {
  const norms = [
    { validFrom: "2026-01-01", value: 600 },
    { validFrom: "2026-11-01", value: 650 },
  ];
  it("counts the norm by loading date and the fuel by fill date", () => {
    const trips: TripSpan[] = [
      { id: "A", tractorId: "t1", startedAt: null, loadedAt: at("2026-10-30T10:00:00+08:00"), unloadedAt: at("2026-11-01T10:00:00+08:00") },
      { id: "B", tractorId: "t1", startedAt: null, loadedAt: at("2026-11-02T10:00:00+08:00"), unloadedAt: at("2026-11-04T10:00:00+08:00") },
    ];
    const entries: FuelEntry[] = [
      { id: "1", tractorId: "t1", filledAt: at("2026-10-29T10:00:00+08:00"), litres: 700, unitPrice: null, currency: null },
      { id: "2", tractorId: "t1", filledAt: at("2026-11-02T08:00:00+08:00"), litres: 650, unitPrice: null, currency: null },
      { id: "3", tractorId: "t1", filledAt: at("2026-11-05T08:00:00+08:00"), litres: 650, unitPrice: null, currency: null },
    ];
    const { rows } = vehicleNormReport(trips, entries, norms);
    expect(rows).toEqual([{ tractorId: "t1", trips: 2, normLitres: 1250, actualLitres: 1350, diffLitres: 100, pendingLitres: 650 }]);
  });
});

describe("trip financials", () => {
  it("separates the margin (revenue − fuel) from the profit", () => {
    const f = tripFinancials({
      contract: { rateType: "PER_TONNE", currency: "CNY", billableWeightBasis: "UNLOADED", rates: [{ validFrom: "2026-01-01", value: 130 }] },
      trip: { loadedAt: at("2026-11-10T10:00:00+08:00"), unloadedAt: at("2026-11-11T10:00:00+08:00"), loadedNetKg: 150800, unloadedNetKg: 150050 },
      fx,
      fuelCosts: [{ mnt: 3_900_000, estimated: true }],
      driverPayMnt: 500_000,
      otherCostsMnt: [100_000],
    });
    expect(f.revenueMnt).toBe(Math.round(150.05 * 130 * 540)); // 10 533 510
    expect(f.marginMnt).toBe(10_533_510 - 3_900_000);
    expect(f.profitMnt).toBe(10_533_510 - 3_900_000 - 500_000 - 100_000);
    expect(f.fuelCostEstimated).toBe(true);
  });
  it("has no revenue, margin or profit without a contract", () => {
    const f = tripFinancials({ contract: null, trip: { loadedAt: null, unloadedAt: null, loadedNetKg: null, unloadedNetKg: null }, fx, fuelCosts: [], driverPayMnt: 0, otherCostsMnt: [] });
    expect(f.revenueMnt).toBeNull();
    expect(f.profitMnt).toBeNull();
  });
});
