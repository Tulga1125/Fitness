import "server-only";
import type { Prisma, TripStatus } from "@prisma/client";
import { db } from "../db";
import { assignFuelToTrips, fuelCost, tripFinancials, type FuelEntry } from "../calc";
import { loadContractTerms, loadDefaultFuelPrice, loadFx } from "./reference";

type Tx = Prisma.TransactionClient;

export const OPEN_STATUSES: TripStatus[] = ["PLANNED", "LOADING", "IN_TRANSIT", "AT_BORDER", "UNLOADING"];

/** The rig's open trip at a moment: one that has started and is not unloaded yet. A rig has at most one. */
export async function findOpenTrip(tx: Tx, companyId: string, tractorId: string) {
  return tx.trip.findFirst({
    where: { companyId, tractorId, deletedAt: null, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

export async function nextTripNo(tx: Tx, companyId: string, at: Date): Promise<string> {
  const prefix = `R${at.getUTCFullYear()}-`;
  const count = await tx.trip.count({ where: { companyId, tripNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

/** Current rig of a tractor: its trailers and driver. */
export async function currentRig(tx: Tx, tractorId: string, at: Date = new Date()) {
  return tx.rig.findFirst({
    where: { tractorId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] },
    orderBy: { validFrom: "desc" },
  });
}

/**
 * Re-attach the tractor's approved fuel to its trips (fuel between trips goes to the trip that starts
 * next; after the last unloading it stays pending), then recompute every trip of the tractor that is
 * not closed. Closed trips are frozen.
 */
export async function reassignFuelAndRecalc(tx: Tx, companyId: string, tractorId: string): Promise<void> {
  const trips = await tx.trip.findMany({ where: { companyId, tractorId, deletedAt: null } });
  const entries = await tx.fuelEntry.findMany({
    where: { companyId, tractorId, status: "APPROVED", deletedAt: null },
    include: { trip: true },
  });
  const closedIds = new Set(trips.filter((t) => t.status === "CLOSED").map((t) => t.id));
  const movable = entries.filter((e) => !e.tripId || !closedIds.has(e.tripId));
  const assignment = assignFuelToTrips(
    movable.map((e) => ({ id: e.id, tractorId: e.tractorId, filledAt: e.filledAt, litres: e.litres, unitPrice: null, currency: null })),
    trips.filter((t) => !closedIds.has(t.id)).map((t) => ({ id: t.id, tractorId: t.tractorId, loadedAt: t.loadedAt, startedAt: t.startedAt, unloadedAt: t.unloadedAt })),
  );
  const target = new Map<string, string | null>();
  for (const e of movable) target.set(e.id, null);
  for (const [tripId, ids] of assignment.byTrip) for (const id of ids) target.set(id, tripId);
  for (const e of movable) {
    const t = target.get(e.id) ?? null;
    if (t !== e.tripId) await tx.fuelEntry.update({ where: { id: e.id }, data: { tripId: t } });
  }
  for (const t of trips) if (!closedIds.has(t.id)) await recalcTrip(tx, t.id);
}

/** Recompute a trip's cached money from approved records only. */
export async function recalcTrip(tx: Tx, tripId: string): Promise<void> {
  const trip = await tx.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      fuelEntries: { where: { status: "APPROVED", deletedAt: null }, include: { station: true } },
      expenses: { where: { status: "APPROVED" } },
    },
  });
  if (trip.status === "CLOSED") return;
  const [fx, defaultPrice, contract] = await Promise.all([
    loadFx(trip.companyId, tx),
    loadDefaultFuelPrice(trip.companyId, tx),
    trip.contractId ? loadContractTerms(trip.contractId, tx) : Promise.resolve(null),
  ]);
  const fuel: FuelEntry[] = trip.fuelEntries.map((e) => ({
    id: e.id,
    tractorId: e.tractorId,
    filledAt: e.filledAt,
    litres: e.litres,
    unitPrice: e.unitPrice == null ? null : Number(e.unitPrice),
    currency: e.currency,
    stationPrice:
      e.station?.fuelPrice != null && e.station.fuelCurrency
        ? { price: Number(e.station.fuelPrice), currency: e.station.fuelCurrency }
        : null,
  }));
  const f = tripFinancials({
    contract,
    trip,
    fx,
    fuelCosts: fuel.map((e) => fuelCost(e, fx, defaultPrice)),
    driverPayMnt: trip.driverPayMnt,
    otherCostsMnt: trip.expenses.map((e) => e.amountMnt),
  });
  await tx.trip.update({
    where: { id: tripId },
    data: {
      revenueMnt: f.revenueMnt,
      revenueForeign: f.revenueForeign ? Math.round(f.revenueForeign.amount * 100) / 100 : null,
      revenueCurrency: f.revenueForeign ? (f.revenueForeign.currency as "CNY" | "MNT") : null,
      rateApplied: f.revenueForeign?.rate ?? null,
      fuelCostMnt: f.fuelCostMnt,
      fuelLitres: fuel.reduce((s, e) => s + e.litres, 0),
      fuelCostEstimated: f.fuelCostEstimated,
      otherCostMnt: f.otherCostMnt,
      marginMnt: f.marginMnt,
      profitMnt: f.profitMnt,
    },
  });
}

/** Guess the contract from what the ticket prints: the contract number, else the mine in its name. */
export async function guessContract(tx: Tx, companyId: string, hints: { contractNoRaw?: string | null; consignorRaw?: string | null; originRaw?: string | null }) {
  const contracts = await tx.contract.findMany({ where: { companyId, deletedAt: null, status: "ACTIVE" } });
  const norm = (s: string) => s.toLowerCase().replace(/\s/g, "");
  if (hints.contractNoRaw) {
    const byNo = contracts.find((c) => norm(c.contractNo) === norm(hints.contractNoRaw!));
    if (byNo) return byNo;
  }
  const text = norm(`${hints.consignorRaw ?? ""} ${hints.originRaw ?? ""}`);
  return contracts.find((c) => text.includes(norm(c.name))) ?? null;
}
