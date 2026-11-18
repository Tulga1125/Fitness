import "server-only";
import type { DocSource } from "@prisma/client";
import { db } from "../db";
import { sha256 } from "../auth/password";
import { storage } from "../storage";
import { getExtractor } from "../vision/extractor";
import { normalizeFuel, normalizeTicket } from "../vision/normalize";
import { currentRig, findOpenTrip } from "./trips";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export const ACCEPTED_TYPES = Object.keys(EXT);

export type IngestResult =
  | { kind: "duplicate"; uploadId: string }
  | { kind: "stored"; uploadId: string };

/**
 * Step 1 of the intake pipeline: store the raw photo first so nothing is ever lost,
 * then read it. A photo already received (same SHA-256) is not stored twice.
 */
export async function ingestPhoto(input: {
  companyId: string;
  data: Buffer;
  mimeType: string;
  source: DocSource;
  userId: string | null;
  tractorId?: string | null;
}): Promise<IngestResult> {
  const ext = EXT[input.mimeType];
  if (!ext) throw new Error("Зөвхөн зураг (JPG, PNG, WEBP) хүлээн авна");
  const hash = sha256(input.data);

  const existing = await db.storedFile.findUnique({
    where: { companyId_sha256: { companyId: input.companyId, sha256: hash } },
    include: { uploads: { take: 1, orderBy: { createdAt: "asc" } } },
  });
  if (existing?.uploads[0]) return { kind: "duplicate", uploadId: existing.uploads[0].id };

  const key = `${input.companyId}/${new Date().toISOString().slice(0, 7)}/${hash}.${ext}`;
  if (!existing) await storage.put(key, input.data);
  const file =
    existing ??
    (await db.storedFile.create({
      data: { companyId: input.companyId, storageKey: key, mimeType: input.mimeType, size: input.data.length, sha256: hash, uploadedBy: input.userId, source: input.source },
    }));
  const upload = await db.upload.create({
    data: { companyId: input.companyId, fileId: file.id, source: input.source, uploadedById: input.userId, tractorId: input.tractorId ?? null },
  });
  await processUpload(upload.id);
  return { kind: "stored", uploadId: upload.id };
}

async function tractorByPlate(companyId: string, plate: string | null) {
  if (!plate) return null;
  return db.vehicle.findFirst({ where: { companyId, plateNo: plate, kind: "TRACTOR", deletedAt: null } });
}

/** Read a stored photo and create a pending record. Safe to run again on a failed upload. */
export async function processUpload(uploadId: string): Promise<void> {
  const upload = await db.upload.findUniqueOrThrow({ where: { id: uploadId }, include: { file: true } });
  if (upload.linkedId) return; // already produced a record
  let result;
  try {
    const data = await storage.get(upload.file.storageKey);
    result = await getExtractor().extract({ data, mimeType: upload.file.mimeType });
  } catch (e) {
    await db.upload.update({ where: { id: uploadId }, data: { status: "FAILED", error: (e as Error).message } });
    return;
  }
  const { extraction, raw } = result;
  const extractionJson = JSON.parse(JSON.stringify({ extraction, raw }));

  if (extraction.document_type === "weigh_ticket" && extraction.ticket) {
    const t = normalizeTicket(extraction.ticket);
    const tractor = (await tractorByPlate(upload.companyId, t.tractorPlate)) ?? (upload.tractorId ? { id: upload.tractorId } : null);
    const duplicate =
      t.ticketNo && t.operatorName
        ? await db.weighTicket.findFirst({ where: { companyId: upload.companyId, operatorName: t.operatorName, ticketNo: t.ticketNo } })
        : null;
    if (duplicate) {
      await db.upload.update({
        where: { id: uploadId },
        data: { status: "DONE", classifiedAs: "weigh_ticket", extractionJson, linkedTable: "weigh_tickets", linkedId: duplicate.id, error: "Энэ баримт өмнө бүртгэгдсэн" },
      });
      return;
    }
    const ticket = await db.$transaction(async (tx) => {
      const trip = tractor ? await findOpenTrip(tx, upload.companyId, tractor.id) : null;
      const { lowConfidenceFields, ...fields } = t;
      return tx.weighTicket.create({
        data: { ...fields, companyId: upload.companyId, tripId: trip?.id ?? null, imageFileId: upload.fileId, source: upload.source, extractionJson, lowConfidenceFields },
      });
    });
    await db.upload.update({ where: { id: uploadId }, data: { status: "DONE", classifiedAs: "weigh_ticket", extractionJson, linkedTable: "weigh_tickets", linkedId: ticket.id } });
    return;
  }

  if ((extraction.document_type === "fuel_receipt" || extraction.document_type === "pump_meter") && extraction.fuel) {
    const f = normalizeFuel(extraction.fuel);
    const tractor = (await tractorByPlate(upload.companyId, f.plateRaw)) ?? (upload.tractorId ? { id: upload.tractorId } : null);
    const rig = tractor ? await db.$transaction((tx) => currentRig(tx, tractor.id)) : null;
    const low = new Set(f.lowConfidenceFields);
    if (f.litres == null) low.add("litres");
    if (f.filledAt == null) low.add("filled_at");
    if (f.arithmeticOk === false) low.add("amount");
    const isMeter = extraction.document_type === "pump_meter";
    const entry = await db.fuelEntry.create({
      data: {
        companyId: upload.companyId,
        tractorId: tractor?.id ?? null,
        driverId: rig?.driverId ?? null,
        plateRaw: f.plateRaw,
        stationRaw: f.stationRaw,
        litres: Math.round(f.litres ?? 0),
        unitPrice: f.unitPrice,
        currency: f.currency,
        amount: f.amount,
        filledAt: f.filledAt ?? upload.createdAt,
        paymentMethod: f.paymentMethod,
        meterImageFileId: isMeter ? upload.fileId : null,
        receiptImageFileId: isMeter ? null : upload.fileId,
        source: upload.source,
        extractionJson,
        lowConfidenceFields: [...low].sort(),
      },
    });
    await db.upload.update({ where: { id: uploadId }, data: { status: "DONE", classifiedAs: extraction.document_type, extractionJson, linkedTable: "fuel_entries", linkedId: entry.id } });
    return;
  }

  await db.upload.update({ where: { id: uploadId }, data: { status: "NOT_A_DOCUMENT", classifiedAs: "other", extractionJson } });
}
