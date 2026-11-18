"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PolicyType } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/auth/password";
import { storage } from "@/lib/storage";
import { ubMidnight } from "@/lib/calc";

const POLICY_TYPES: PolicyType[] = ["DRIVER_LIABILITY", "VEHICLE", "CARGO", "OTHER"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function addPolicy(formData: FormData) {
  const user = await requirePermission("insurance.edit");
  const vehicleId = String(formData.get("vehicleId"));
  const back = `/fleet/${vehicleId}`;
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, companyId: user.companyId } });
  if (!vehicle) redirect("/fleet");
  const policyType = String(formData.get("policyType")) as PolicyType;
  const start = String(formData.get("startDate") ?? "");
  const end = String(formData.get("endDate") ?? "");
  if (!POLICY_TYPES.includes(policyType) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    redirect(`${back}?error=${encodeURIComponent("Огноо эсвэл төрөл буруу")}`);
  }
  let contractFileId: string | null = null;
  const file = formData.get("contractFile");
  if (file instanceof File && file.size > 0) {
    const ext = EXT[file.type];
    if (!ext) redirect(`${back}?error=${encodeURIComponent("Гэрээний хуулбар зураг байх ёстой")}`);
    const data = Buffer.from(await file.arrayBuffer());
    const hash = sha256(data);
    const existing = await db.storedFile.findUnique({ where: { companyId_sha256: { companyId: user.companyId, sha256: hash } } });
    if (existing) contractFileId = existing.id;
    else {
      const key = `${user.companyId}/policies/${hash}.${ext}`;
      await storage.put(key, data);
      contractFileId = (await db.storedFile.create({ data: { companyId: user.companyId, storageKey: key, mimeType: file.type, size: data.length, sha256: hash, uploadedBy: user.id, source: "MANUAL_UPLOAD" } })).id;
    }
  }
  const premium = Number(String(formData.get("premiumMnt") ?? "").replace(/\s/g, ""));
  await db.insurancePolicy.create({
    data: {
      companyId: user.companyId, vehicleId, policyType,
      policyNo: String(formData.get("policyNo") ?? "") || null,
      insurerId: String(formData.get("insurerId") ?? "") || null,
      premiumMnt: Number.isFinite(premium) && premium > 0 ? Math.round(premium) : null,
      startDate: ubMidnight(start), endDate: ubMidnight(end), contractFileId,
    },
  });
  revalidatePath(back);
  redirect(back);
}
