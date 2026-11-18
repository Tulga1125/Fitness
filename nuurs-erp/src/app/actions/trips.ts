"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recalcTrip } from "@/lib/services/trips";

/** Manager confirms or changes the contract of a trip (auto-created trips need this). */
export async function setTripContract(formData: FormData) {
  const user = await requirePermission("trips.edit");
  const id = String(formData.get("id"));
  const contractId = String(formData.get("contractId") || "") || null;
  await db.$transaction(async (tx) => {
    const trip = await tx.trip.findFirst({ where: { id, companyId: user.companyId } });
    if (!trip || trip.status === "CLOSED") throw new Error("Рейсийг өөрчлөх боломжгүй");
    const contract = contractId ? await tx.contract.findFirst({ where: { id: contractId, companyId: user.companyId } }) : null;
    await tx.trip.update({ where: { id }, data: { contractId: contract?.id ?? null, routeId: contract?.routeId ?? trip.routeId, createdBy: trip.createdBy === "auto" ? "auto-confirmed" : trip.createdBy } });
    await recalcTrip(tx, id);
  });
  revalidatePath(`/trips/${id}`);
}

/** Accountant closes a completed trip once nothing attached to it is still pending. Closing freezes its numbers. */
export async function closeTrip(formData: FormData) {
  const user = await requirePermission("trips.close");
  const id = String(formData.get("id"));
  const trip = await db.trip.findFirst({ where: { id, companyId: user.companyId } });
  if (!trip) redirect("/trips");
  const pending =
    (await db.weighTicket.count({ where: { tripId: id, status: "PENDING", deletedAt: null } })) +
    (await db.fuelEntry.count({ where: { tripId: id, status: "PENDING", deletedAt: null } })) +
    (await db.tripExpense.count({ where: { tripId: id, status: "PENDING" } }));
  if (trip.status !== "COMPLETED") redirect(`/trips/${id}?error=${encodeURIComponent("Зөвхөн дууссан рейсийг хаана")}`);
  if (pending > 0) redirect(`/trips/${id}?error=${encodeURIComponent(`${pending} бичлэг батлагдаагүй байна`)}`);
  if (!trip.contractId) redirect(`/trips/${id}?error=${encodeURIComponent("Гэрээгүй рейсийг хаах боломжгүй")}`);
  await db.$transaction(async (tx) => {
    await recalcTrip(tx, id);
    await tx.trip.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
  });
  revalidatePath(`/trips/${id}`);
}
