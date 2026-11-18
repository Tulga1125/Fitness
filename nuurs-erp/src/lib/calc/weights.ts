export type TicketKind = "LOAD" | "UNLOAD";

/**
 * At unloading the truck enters full and leaves empty: net = in − out.
 * At loading it enters empty and leaves full: net = out − in.
 */
export function expectedNetKg(kind: TicketKind, weightInKg: number, weightOutKg: number): number {
  return kind === "UNLOAD" ? weightInKg - weightOutKg : weightOutKg - weightInKg;
}

export type WeightCheck = { ok: true } | { ok: false; expectedNetKg: number; message: string };

/** A ticket whose printed net does not match its in/out weights cannot be approved without an edit. */
export function checkTicketWeights(t: {
  kind: TicketKind;
  weightInKg: number | null;
  weightOutKg: number | null;
  netKg: number | null;
}): WeightCheck {
  if (t.weightInKg == null || t.weightOutKg == null || t.netKg == null) {
    return { ok: false, expectedNetKg: NaN, message: "Жин бүрэн биш" };
  }
  const expected = expectedNetKg(t.kind, t.weightInKg, t.weightOutKg);
  if (expected <= 0) return { ok: false, expectedNetKg: expected, message: "Цэвэр жин эерэг байх ёстой" };
  if (expected !== t.netKg) {
    return { ok: false, expectedNetKg: expected, message: `Цэвэр жин ${expected} кг байх ёстой` };
  }
  return { ok: true };
}

/** Weight lost between the loading and unloading tickets, in kg and percent of loaded weight. */
export function weightLoss(loadedNetKg: number, unloadedNetKg: number): { kg: number; percent: number } {
  const kg = loadedNetKg - unloadedNetKg;
  return { kg, percent: loadedNetKg > 0 ? (kg / loadedNetKg) * 100 : 0 };
}
