import type { FuelExtraction, TicketExtraction } from "./schema";

/** Below this confidence a field is highlighted for the accountant. */
export const LOW_CONFIDENCE = 0.8;

/** Plates are stored upper-case without spaces or dashes: "3341 өмн" → "3341ӨМН". */
export function normalizePlate(s: string | null | undefined): string | null {
  if (!s) return null;
  const p = s.toUpperCase().replace(/[\s\-.]/g, "");
  return p || null;
}

/** Ticket times are printed without zone; they are Ulaanbaatar time. Accepts "2026-11-12 14:05[:ss]". */
export function parseUbDateTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})[-./](\d{2})[-./](\d{2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const iso = `${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi}:${se ?? "00"}+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Б.Бат, УБ90010101, 99112233" → name, register number, phone. */
export function splitDriverCombined(s: string | null | undefined): { name: string | null; registerNo: string | null; phone: string | null } {
  if (!s) return { name: null, registerNo: null, phone: null };
  const parts = s.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  let name: string | null = null;
  let registerNo: string | null = null;
  let phone: string | null = null;
  for (const p of parts) {
    if (!registerNo && /^[А-ЯӨҮЁ]{2}\s?\d{8}$/i.test(p)) registerNo = p.replace(/\s/g, "").toUpperCase();
    else if (!phone && /^\+?\d[\d\s-]{6,}$/.test(p)) phone = p.replace(/\D/g, "");
    else if (!name) name = p;
  }
  return { name, registerNo, phone };
}

/** Fields the accountant must look at: low confidence, or covered by a stamp or fold. */
export function lowConfidenceFields(fields: Record<string, unknown>, obscured: string[]): string[] {
  const low = new Set(obscured);
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === "object" && "confidence" in v) {
      const f = v as { value: unknown; confidence: number };
      if (f.value != null && f.confidence < LOW_CONFIDENCE) low.add(k);
    }
  }
  return [...low].sort();
}

export type NormalizedTicket = {
  kind: "LOAD" | "UNLOAD";
  ticketNo: string | null;
  operatorName: string | null;
  consignorRaw: string | null;
  buyerRaw: string | null;
  carrierRaw: string | null;
  product: string | null;
  tractorPlate: string | null;
  trailerPlates: string[];
  driverName: string | null;
  driverRegisterNo: string | null;
  driverPhone: string | null;
  contractNoRaw: string | null;
  weightInKg: number | null;
  weightOutKg: number | null;
  netKg: number | null;
  timeIn: Date | null;
  timeOut: Date | null;
  printedAt: Date | null;
  originRaw: string | null;
  destinationRaw: string | null;
  cPermit: string | null;
  sealNo: string | null;
  containerNo: string | null;
  weigherName: string | null;
  lowConfidenceFields: string[];
};

export function normalizeTicket(t: TicketExtraction): NormalizedTicket {
  const v = <T>(f: { value: T | null }) => f.value;
  const driver = splitDriverCombined(v(t.driver_combined));
  const { obscured_fields, ...fields } = t;
  return {
    kind: v(t.kind) ?? "UNLOAD",
    ticketNo: v(t.ticket_no)?.replace(/\s/g, "") ?? null,
    operatorName: v(t.operator_name),
    consignorRaw: v(t.consignor),
    buyerRaw: v(t.buyer),
    carrierRaw: v(t.carrier),
    product: v(t.product),
    tractorPlate: normalizePlate(v(t.tractor_plate)),
    trailerPlates: [normalizePlate(v(t.trailer_plate_1)), normalizePlate(v(t.trailer_plate_2))].filter((p): p is string => !!p),
    driverName: driver.name,
    driverRegisterNo: driver.registerNo,
    driverPhone: driver.phone,
    contractNoRaw: v(t.contract_no),
    weightInKg: v(t.weight_in_kg),
    weightOutKg: v(t.weight_out_kg),
    netKg: v(t.net_kg),
    timeIn: parseUbDateTime(v(t.time_in)),
    timeOut: parseUbDateTime(v(t.time_out)),
    printedAt: parseUbDateTime(v(t.printed_at)) ?? parseUbDateTime(v(t.ticket_datetime)),
    originRaw: v(t.loading_place),
    destinationRaw: v(t.destination),
    cPermit: v(t.c_permit),
    sealNo: v(t.seal_no),
    containerNo: v(t.container_no),
    weigherName: v(t.weigher_name),
    lowConfidenceFields: lowConfidenceFields(fields, obscured_fields),
  };
}

export type NormalizedFuel = {
  stationRaw: string | null;
  plateRaw: string | null;
  litres: number | null;
  unitPrice: number | null;
  currency: "MNT" | "CNY" | null;
  amount: number | null;
  filledAt: Date | null;
  paymentMethod: string | null;
  lowConfidenceFields: string[];
  /** litres × unit price must match the amount within 1% */
  arithmeticOk: boolean | null;
};

export function normalizeFuel(f: FuelExtraction): NormalizedFuel {
  const { obscured_fields, ...fields } = f;
  const litres = f.litres.value;
  const unitPrice = f.unit_price.value;
  const amount = f.amount.value;
  const arithmeticOk =
    litres != null && unitPrice != null && amount != null && amount > 0
      ? Math.abs(litres * unitPrice - amount) / amount <= 0.01
      : null;
  return {
    stationRaw: f.station.value,
    plateRaw: normalizePlate(f.plate.value),
    litres,
    unitPrice,
    currency: f.currency.value,
    amount,
    filledAt: parseUbDateTime(f.filled_at.value),
    paymentMethod: f.payment_method.value,
    lowConfidenceFields: lowConfidenceFields(fields, obscured_fields),
    arithmeticOk,
  };
}
