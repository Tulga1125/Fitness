import { describe, expect, it } from "vitest";
import { checkTicketWeights } from "../calc";
import { normalizeFuel, normalizePlate, normalizeTicket, parseUbDateTime, splitDriverCombined } from "./normalize";
import { sampleUnloadTicket } from "./sample";

describe("ticket normalization", () => {
  it("turns the sample unloading ticket into a record with both trailer plates and a flagged contract number", () => {
    const t = normalizeTicket(sampleUnloadTicket().ticket!);
    expect(t).toMatchObject({
      kind: "UNLOAD",
      ticketNo: "11260039412",
      weightInKg: 197000,
      weightOutKg: 46950,
      netKg: 150050,
      tractorPlate: "3341ӨМН",
      trailerPlates: ["1234ЧА", "1235ЧА"],
      driverName: "Б.Батбаяр",
      driverRegisterNo: "УБ90010101",
      driverPhone: "99112233",
    });
    expect(t.lowConfidenceFields).toContain("contract_no");
    expect(t.lowConfidenceFields).toContain("loading_place");
    expect(checkTicketWeights(t)).toEqual({ ok: true });
  });

  it("reads ticket times as Ulaanbaatar time", () => {
    expect(parseUbDateTime("2026-11-12 14:05")?.toISOString()).toBe("2026-11-12T06:05:00.000Z");
    expect(parseUbDateTime("12/11/2026")).toBeNull();
  });

  it("normalizes plates", () => {
    expect(normalizePlate(" 3341 өмн ")).toBe("3341ӨМН");
    expect(normalizePlate("")).toBeNull();
  });

  it("splits the combined driver field in any order", () => {
    expect(splitDriverCombined("99112233, Б.Бат, УБ90010101")).toEqual({ name: "Б.Бат", registerNo: "УБ90010101", phone: "99112233" });
  });
});

describe("fuel normalization", () => {
  const f = <T>(value: T | null, confidence = 0.95) => ({ value, confidence });
  it("checks litres × price against the amount within 1%", () => {
    const base = {
      station: f("Мөрөн колонк"), plate: f("2548 убэ"), litres: f(650), unit_price: f(9.007),
      currency: f<"MNT" | "CNY">("CNY"), amount: f(5854.55), filled_at: f("2026-11-15 08:30"),
      payment_method: f(null), obscured_fields: [],
    };
    expect(normalizeFuel(base)).toMatchObject({ plateRaw: "2548УБЭ", arithmeticOk: true });
    expect(normalizeFuel({ ...base, amount: f(6200) }).arithmeticOk).toBe(false);
    expect(normalizeFuel({ ...base, litres: f(650, 0.5) }).lowConfidenceFields).toEqual(["litres"]);
  });
});
