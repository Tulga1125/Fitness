import "server-only";
import type { Prisma, WeighTicket } from "@prisma/client";
import { db } from "../db";
import { checkTicketWeights } from "../calc";
import { normalizePlate } from "../vision/normalize";
import type { CurrentUser } from "../auth/session";
import { can } from "../auth/permissions";
import { currentRig, findOpenTrip, guessContract, nextTripNo, reassignFuelAndRecalc } from "./trips";

type Tx = Prisma.TransactionClient;

export class ApprovalError extends Error {}

/** Fields the accountant may correct on a weighbridge ticket. */
export type TicketEdits = Partial<{
  kind: "LOAD" | "UNLOAD";
  ticketNo: string | null;
  operatorName: string | null;
  tractorPlate: string | null;
  trailerPlates: string[];
  contractNoRaw: string | null;
  weightInKg: number | null;
  weightOutKg: number | null;
  netKg: number | null;
  timeIn: Date | null;
  timeOut: Date | null;
  printedAt: Date | null;
}>;

export type FuelEdits = Partial<{
  plateRaw: string | null;
  litres: number;
  unitPrice: number | null;
  currency: "MNT" | "CNY" | null;
  amount: number | null;
  filledAt: Date;
  stationRaw: string | null;
}>;

const show = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(", ") : String(v));

/** Write one change-log row per field whose value really changed. */
async function logChanges(tx: Tx, user: CurrentUser, table: string, rowId: string, before: Record<string, unknown>, edits: Record<string, unknown>, reason: string) {
  for (const [field, next] of Object.entries(edits)) {
    if (next === undefined) continue;
    const prev = before[field];
    if (show(prev) === show(next)) continue;
    await tx.changeLog.create({
      data: { companyId: user.companyId, tableName: table, rowId, field, oldValue: show(prev), newValue: show(next), userId: user.id, reason },
    });
  }
}

/** Put an approved ticket's weight and time on its trip, creating the trip when the rig has none open. */
async function applyTicketToTrip(tx: Tx, user: CurrentUser, ticket: WeighTicket): Promise<string> {
  const plate = normalizePlate(ticket.tractorPlate);
  const tractor = plate
    ? await tx.vehicle.findFirst({ where: { companyId: user.companyId, plateNo: plate, kind: "TRACTOR", deletedAt: null } })
    : null;
  let trip = ticket.tripId ? await tx.trip.findUnique({ where: { id: ticket.tripId } }) : null;
  if (!trip && !tractor) throw new ApprovalError(`Толгойн дугаар ${ticket.tractorPlate ?? "—"} машины санд алга. Эхлээд машиныг бүртгэнэ үү.`);
  if (trip?.status === "CLOSED") throw new ApprovalError("Рейс хаагдсан тул өөрчлөх боломжгүй");
  const when = ticket.timeOut ?? ticket.printedAt ?? ticket.timeIn ?? new Date();

  if (!trip && tractor) trip = await findOpenTrip(tx, user.companyId, tractor.id);
  if (!trip && tractor) {
    // No open trip: the system creates one and the manager confirms its contract.
    const rig = await currentRig(tx, tractor.id, when);
    const contract = await guessContract(tx, user.companyId, ticket);
    trip = await tx.trip.create({
      data: {
        companyId: user.companyId,
        tripNo: await nextTripNo(tx, user.companyId, when),
        tractorId: tractor.id,
        trailer1Id: rig?.trailer1Id ?? null,
        trailer2Id: rig?.trailer2Id ?? null,
        driverId: rig?.driverId ?? null,
        contractId: contract?.id ?? null,
        routeId: contract?.routeId ?? null,
        createdBy: "auto",
        startedAt: when,
        status: "LOADING",
      },
    });
  }
  if (!trip) throw new ApprovalError("Рейс олдсонгүй");

  const data: Prisma.TripUpdateInput =
    ticket.kind === "LOAD"
      ? { loadedAt: when, loadedNetKg: ticket.netKg, status: trip.unloadedAt ? trip.status : "IN_TRANSIT" }
      : { unloadedAt: when, unloadedNetKg: ticket.netKg, status: "COMPLETED" };
  await tx.trip.update({ where: { id: trip.id }, data });
  if (ticket.tripId !== trip.id) await tx.weighTicket.update({ where: { id: ticket.id }, data: { tripId: trip.id } });
  return trip.tractorId;
}

function normalizeTicketEdits(edits: TicketEdits): TicketEdits {
  const out = { ...edits };
  if (out.tractorPlate !== undefined) out.tractorPlate = normalizePlate(out.tractorPlate);
  if (out.trailerPlates) out.trailerPlates = out.trailerPlates.map((p) => normalizePlate(p)).filter((p): p is string => !!p);
  return out;
}

/** Accountant approves a pending ticket, optionally after correcting fields. */
export async function approveTicket(user: CurrentUser, id: string, rawEdits: TicketEdits) {
  if (!can(user.role, "docs.approve")) throw new ApprovalError("Зөвхөн нягтлан батална");
  const edits = normalizeTicketEdits(rawEdits);
  await db.$transaction(async (tx) => {
    const t = await tx.weighTicket.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!t) throw new ApprovalError("Баримт олдсонгүй");
    if (t.status !== "PENDING") throw new ApprovalError("Баримт аль хэдийн шийдвэрлэгдсэн");
    const merged = { ...t, ...edits };
    const check = checkTicketWeights(merged);
    if (!check.ok) throw new ApprovalError(`Жин зөрүүтэй: ${check.message}`);
    // Corrections against what the model read are kept for audit rule R10 and accuracy reports.
    await logChanges(tx, user, "weigh_tickets", id, t, edits, "Батлахын өмнөх засвар");
    const updated = await tx.weighTicket.update({
      where: { id },
      data: { ...edits, status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
    });
    const tractorId = await applyTicketToTrip(tx, user, updated);
    await reassignFuelAndRecalc(tx, user.companyId, tractorId);
  });
}

/** Changing an approved ticket: accountant or director only, a reason is required, every field is logged. */
export async function editApprovedTicket(user: CurrentUser, id: string, rawEdits: TicketEdits, reason: string) {
  if (!can(user.role, "docs.editApproved")) throw new ApprovalError("Батлагдсан баримтыг засах эрхгүй");
  if (!reason.trim()) throw new ApprovalError("Засварын шалтгааныг бичнэ үү");
  const edits = normalizeTicketEdits(rawEdits);
  await db.$transaction(async (tx) => {
    const t = await tx.weighTicket.findFirst({ where: { id, companyId: user.companyId, status: "APPROVED" } });
    if (!t) throw new ApprovalError("Батлагдсан баримт олдсонгүй");
    const check = checkTicketWeights({ ...t, ...edits });
    if (!check.ok) throw new ApprovalError(`Жин зөрүүтэй: ${check.message}`);
    await logChanges(tx, user, "weigh_tickets", id, t, edits, reason.trim());
    const updated = await tx.weighTicket.update({ where: { id }, data: edits });
    const tractorId = await applyTicketToTrip(tx, user, updated);
    await reassignFuelAndRecalc(tx, user.companyId, tractorId);
  });
}

export async function rejectTicket(user: CurrentUser, id: string, reason: string) {
  if (!can(user.role, "docs.approve")) throw new ApprovalError("Зөвхөн нягтлан шийдвэрлэнэ");
  if (!reason.trim()) throw new ApprovalError("Татгалзсан шалтгааныг бичнэ үү");
  const r = await db.weighTicket.updateMany({
    where: { id, companyId: user.companyId, status: "PENDING" },
    data: { status: "REJECTED", rejectReason: reason.trim(), approvedById: user.id, approvedAt: new Date() },
  });
  if (r.count === 0) throw new ApprovalError("Хүлээгдэж буй баримт олдсонгүй");
}

async function resolveTractor(tx: Tx, companyId: string, plate: string | null | undefined) {
  const p = normalizePlate(plate);
  if (!p) return null;
  return tx.vehicle.findFirst({ where: { companyId, plateNo: p, kind: "TRACTOR", deletedAt: null } });
}

export async function approveFuel(user: CurrentUser, id: string, edits: FuelEdits) {
  if (!can(user.role, "docs.approve")) throw new ApprovalError("Зөвхөн нягтлан батална");
  await db.$transaction(async (tx) => {
    const e = await tx.fuelEntry.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!e) throw new ApprovalError("Түлшний бичлэг олдсонгүй");
    if (e.status !== "PENDING") throw new ApprovalError("Аль хэдийн шийдвэрлэгдсэн");
    const litres = edits.litres ?? e.litres;
    if (!(litres > 0)) throw new ApprovalError("Литр 0-ээс их байх ёстой");
    const plate = edits.plateRaw !== undefined ? normalizePlate(edits.plateRaw) : e.plateRaw;
    const tractor = plate ? await resolveTractor(tx, user.companyId, plate) : e.tractorId ? { id: e.tractorId } : null;
    if (plate && !tractor) throw new ApprovalError(`${plate} дугаартай толгой машины санд алга`);
    await logChanges(tx, user, "fuel_entries", id, e, { ...edits, plateRaw: plate }, "Батлахын өмнөх засвар");
    await tx.fuelEntry.update({
      where: { id },
      data: { ...edits, plateRaw: plate, tractorId: tractor?.id ?? null, status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
    });
    if (tractor) await reassignFuelAndRecalc(tx, user.companyId, tractor.id);
  });
}

export async function rejectFuel(user: CurrentUser, id: string, reason: string) {
  if (!can(user.role, "docs.approve")) throw new ApprovalError("Зөвхөн нягтлан шийдвэрлэнэ");
  if (!reason.trim()) throw new ApprovalError("Татгалзсан шалтгааныг бичнэ үү");
  const r = await db.fuelEntry.updateMany({
    where: { id, companyId: user.companyId, status: "PENDING" },
    data: { status: "REJECTED", rejectReason: reason.trim(), approvedById: user.id, approvedAt: new Date() },
  });
  if (r.count === 0) throw new ApprovalError("Хүлээгдэж буй бичлэг олдсонгүй");
}
