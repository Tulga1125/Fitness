import { valueAt, type Dated } from "./history";
import { toMnt, type Currency, type FxTable } from "./money";

export type FuelEntry = {
  id: string;
  tractorId: string | null;
  filledAt: Date;
  litres: number;
  unitPrice: number | null;
  currency: Currency | null;
  /** Default price of the station, used when the receipt has no price. */
  stationPrice?: { price: number; currency: Currency } | null;
};

export type TripSpan = {
  id: string;
  tractorId: string;
  /** Loading date: the trip's fuel norm is chosen by it. */
  loadedAt: Date | null;
  startedAt: Date | null;
  unloadedAt: Date | null;
};

export type FuelCost = { mnt: number; estimated: boolean; source: "receipt" | "station" | "default" };

/**
 * Cost of a fuel entry in MNT. Uses the receipt price, else the station's price,
 * else the company default (6 000 ₮/L) — the last two are marked as estimates.
 */
export function fuelCost(e: FuelEntry, fx: FxTable, defaultPriceMnt: number): FuelCost {
  if (e.unitPrice != null && e.currency) {
    return { mnt: toMnt(e.litres * e.unitPrice, e.currency, e.filledAt, fx), estimated: false, source: "receipt" };
  }
  if (e.stationPrice) {
    const { price, currency } = e.stationPrice;
    return { mnt: toMnt(e.litres * price, currency, e.filledAt, fx), estimated: true, source: "station" };
  }
  return { mnt: Math.round(e.litres * defaultPriceMnt), estimated: true, source: "default" };
}

export type FuelAssignment = {
  /** trip id → ids of the fuel entries attached to it */
  byTrip: Map<string, string[]>;
  /** Bought after the tractor's last unloading: its trip is not registered yet. */
  pending: FuelEntry[];
  /** No tractor plate on the entry. */
  unassigned: FuelEntry[];
  /** The tractor has no trips at all. */
  noTrip: FuelEntry[];
};

function tripStart(t: TripSpan): Date | null {
  return t.loadedAt ?? t.startedAt;
}

/**
 * Attach each fuel entry to a trip of the same tractor.
 * Fuel bought before a trip starts or while it runs belongs to that trip; fuel bought between
 * two trips belongs to the trip that starts next. Fuel after the last unloading is pending.
 */
export function assignFuelToTrips(entries: FuelEntry[], trips: TripSpan[]): FuelAssignment {
  const byTractor = new Map<string, TripSpan[]>();
  for (const t of trips) {
    const list = byTractor.get(t.tractorId) ?? [];
    list.push(t);
    byTractor.set(t.tractorId, list);
  }
  for (const list of byTractor.values()) {
    list.sort((a, b) => (tripStart(a)?.getTime() ?? Infinity) - (tripStart(b)?.getTime() ?? Infinity));
  }

  const result: FuelAssignment = { byTrip: new Map(), pending: [], unassigned: [], noTrip: [] };
  for (const e of entries) {
    if (!e.tractorId) {
      result.unassigned.push(e);
      continue;
    }
    const list = byTractor.get(e.tractorId);
    if (!list || list.length === 0) {
      result.noTrip.push(e);
      continue;
    }
    // First trip that has not finished before the fill: an open trip (no unloading yet) takes it too.
    const trip = list.find((t) => !t.unloadedAt || t.unloadedAt.getTime() >= e.filledAt.getTime());
    if (!trip) {
      result.pending.push(e);
      continue;
    }
    const ids = result.byTrip.get(trip.id) ?? [];
    ids.push(e.id);
    result.byTrip.set(trip.id, ids);
  }
  return result;
}

/** Fuel norm for a trip, chosen by its loading date (600 L until Oct, 650 L winter from 2026-11-01). */
export function tripNormLitres(norms: Dated<number>[], loadedAt: Date): number | null {
  return valueAt(norms, loadedAt);
}

export type VehicleNormRow = {
  tractorId: string;
  trips: number;
  normLitres: number;
  /** Fuel attached to the vehicle's trips. */
  actualLitres: number;
  /** actual − norm: positive is over the norm. */
  diffLitres: number;
  /** Fuel bought after the last unloading; its trip is not registered yet. */
  pendingLitres: number;
};

/**
 * Compare fuel taken by each tractor with the norm of its trips.
 * Norms are counted by trip loading date, fuel by fill date — the same rules as the monthly report.
 */
export function vehicleNormReport(
  trips: TripSpan[],
  entries: FuelEntry[],
  norms: Dated<number>[],
): { rows: VehicleNormRow[]; assignment: FuelAssignment } {
  const assignment = assignFuelToTrips(entries, trips);
  const litresById = new Map(entries.map((e) => [e.id, e.litres]));
  const rows = new Map<string, VehicleNormRow>();
  const row = (tractorId: string) => {
    let r = rows.get(tractorId);
    if (!r) {
      r = { tractorId, trips: 0, normLitres: 0, actualLitres: 0, diffLitres: 0, pendingLitres: 0 };
      rows.set(tractorId, r);
    }
    return r;
  };
  for (const t of trips) {
    const start = tripStart(t);
    if (!start) continue;
    const r = row(t.tractorId);
    r.trips += 1;
    r.normLitres += tripNormLitres(norms, start) ?? 0;
    for (const id of assignment.byTrip.get(t.id) ?? []) r.actualLitres += litresById.get(id) ?? 0;
  }
  for (const e of assignment.pending) if (e.tractorId) row(e.tractorId).pendingLitres += e.litres;
  for (const r of rows.values()) r.diffLitres = r.actualLitres - r.normLitres;
  return { rows: [...rows.values()].sort((a, b) => b.diffLitres - a.diffLitres), assignment };
}
