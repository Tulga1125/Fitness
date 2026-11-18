"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ACCEPTED_TYPES, ingestPhoto, processUpload } from "@/lib/services/intake";
import {
  ApprovalError,
  approveFuel,
  approveTicket,
  editApprovedTicket,
  rejectFuel,
  rejectTicket,
  type FuelEdits,
  type TicketEdits,
} from "@/lib/services/approvals";
import { fromLocalInput } from "@/lib/format";

const MAX_BYTES = 12 * 1024 * 1024;

/** Office staff or a driver uploads one or more photos. Each is stored first, then read. */
export async function uploadPhotos(formData: FormData) {
  const user = await requirePermission("docs.upload");
  let tractorId = (formData.get("tractorId") as string) || null;
  if (user.role === "DRIVER") {
    // Drivers always upload for their own current rig.
    const rig = user.driverId
      ? await db.rig.findFirst({ where: { driverId: user.driverId, validTo: null }, orderBy: { validFrom: "desc" } })
      : null;
    tractorId = rig?.tractorId ?? null;
  }
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  let stored = 0;
  let dup = 0;
  const errors: string[] = [];
  for (const f of files) {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      errors.push(`${f.name}: зураг биш`);
      continue;
    }
    if (f.size > MAX_BYTES) {
      errors.push(`${f.name}: 12 MB-аас том`);
      continue;
    }
    const r = await ingestPhoto({
      companyId: user.companyId,
      data: Buffer.from(await f.arrayBuffer()),
      mimeType: f.type,
      source: user.role === "DRIVER" ? "DRIVER_APP" : "MANUAL_UPLOAD",
      userId: user.id,
      tractorId,
    });
    if (r.kind === "duplicate") dup += 1;
    else stored += 1;
  }
  const q = new URLSearchParams({ stored: String(stored), dup: String(dup) });
  if (errors.length) q.set("error", errors.join("; "));
  redirect(`${user.role === "DRIVER" ? "/driver" : "/upload"}?${q}`);
}

export async function retryUpload(formData: FormData) {
  await requirePermission("docs.upload");
  await processUpload(String(formData.get("uploadId")));
  revalidatePath("/upload");
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const int = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (s === undefined) return undefined;
  if (s === null) return null;
  const n = Number(s.replace(/\s/g, ""));
  if (!Number.isFinite(n)) throw new ApprovalError(`${k}: тоо биш`);
  return Math.round(n);
};
const num = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (s === undefined) return undefined;
  if (s === null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new ApprovalError(`${k}: тоо биш`);
  return n;
};
const dt = (fd: FormData, k: string) => {
  const s = str(fd, k);
  return s === undefined ? undefined : fromLocalInput(s);
};

function ticketEdits(fd: FormData): TicketEdits {
  const kind = str(fd, "kind");
  return {
    kind: kind === "LOAD" || kind === "UNLOAD" ? kind : undefined,
    ticketNo: str(fd, "ticketNo"),
    operatorName: str(fd, "operatorName"),
    tractorPlate: str(fd, "tractorPlate"),
    trailerPlates: [str(fd, "trailer1"), str(fd, "trailer2")].filter((p): p is string => !!p),
    contractNoRaw: str(fd, "contractNoRaw"),
    weightInKg: int(fd, "weightInKg"),
    weightOutKg: int(fd, "weightOutKg"),
    netKg: int(fd, "netKg"),
    timeIn: dt(fd, "timeIn"),
    timeOut: dt(fd, "timeOut"),
    printedAt: dt(fd, "printedAt"),
  };
}

function fuelEdits(fd: FormData): FuelEdits {
  const currency = str(fd, "currency");
  const litres = num(fd, "litres");
  const filledAt = dt(fd, "filledAt");
  return {
    plateRaw: str(fd, "plateRaw"),
    litres: litres == null ? undefined : Math.round(litres),
    unitPrice: num(fd, "unitPrice"),
    currency: currency === "MNT" || currency === "CNY" ? currency : null,
    amount: num(fd, "amount"),
    filledAt: filledAt ?? undefined,
    stationRaw: str(fd, "stationRaw"),
  };
}

async function decide(back: string, fn: () => Promise<void>, done: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApprovalError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(done);
}

export async function decideTicket(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  const back = `/approvals/ticket/${id}`;
  await decide(
    back,
    async () => {
      if (op === "reject") return rejectTicket(user, id, String(formData.get("reason") ?? ""));
      if (op === "edit") return editApprovedTicket(user, id, ticketEdits(formData), String(formData.get("reason") ?? ""));
      return approveTicket(user, id, ticketEdits(formData));
    },
    op === "edit" ? `${back}?saved=1` : "/approvals",
  );
}

export async function decideFuel(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  if (!can(user.role, "docs.approve")) redirect(`/approvals/fuel/${id}?error=${encodeURIComponent("Зөвхөн нягтлан батална")}`);
  await decide(
    `/approvals/fuel/${id}`,
    async () => (op === "reject" ? rejectFuel(user, id, String(formData.get("reason") ?? "")) : approveFuel(user, id, fuelEdits(formData))),
    "/approvals",
  );
}
