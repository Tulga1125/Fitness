"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recalcTrip, OPEN_STATUSES } from "@/lib/services/trips";
import { ubMidnight } from "@/lib/calc";

/** Add a rate that applies from a date. Trips not yet closed from that date are recalculated. */
export async function addContractRate(formData: FormData) {
  const user = await requirePermission("contracts.edit");
  const contractId = String(formData.get("contractId"));
  const validFrom = String(formData.get("validFrom") ?? "");
  const rate = Number(String(formData.get("rate") ?? "").replace(",", "."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom) || !(rate > 0)) redirect(`/contracts?error=${encodeURIComponent("Ханш эсвэл огноо буруу")}`);
  const contract = await db.contract.findFirst({ where: { id: contractId, companyId: user.companyId } });
  if (!contract) redirect("/contracts");
  await db.$transaction(async (tx) => {
    await tx.contractRate.upsert({
      where: { contractId_validFrom: { contractId, validFrom } },
      create: { contractId, validFrom, rate },
      update: { rate },
    });
    const from = ubMidnight(validFrom);
    const trips = await tx.trip.findMany({
      where: { contractId, status: { in: [...OPEN_STATUSES, "COMPLETED"] }, OR: [{ loadedAt: { gte: from } }, { loadedAt: null, unloadedAt: { gte: from } }] },
      select: { id: true },
    });
    for (const t of trips) await recalcTrip(tx, t.id);
  });
  revalidatePath("/contracts");
  redirect("/contracts");
}
