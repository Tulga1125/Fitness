import type { Extraction } from "./schema";

const f = <T>(value: T | null, confidence = 0.97) => ({ value, confidence });

/**
 * The sample unloading ticket from the spec (ticket 11260039412, 197 000 / 46 950 / 150 050 kg).
 * The round stamp covers the contract number, so it comes back low-confidence.
 * Plates match the demo seed data.
 */
export function sampleUnloadTicket(): Extraction {
  return {
    document_type: "weigh_ticket",
    fuel: null,
    ticket: {
      operator_name: f("Пүү Оператор ХХК"),
      ticket_no: f("11260039412"),
      consignor: f("Нагааранз уурхай"),
      buyer: f("Inner Mongolia Coal Trading Co."),
      carrier: f("Сүндэр Ложистик ХХК"),
      kind: f<"LOAD" | "UNLOAD">("UNLOAD"),
      ticket_datetime: f("2026-11-12 14:05"),
      product: f("1/3 коксжих нүүрс"),
      tractor_plate: f("3341 ӨМН"),
      time_in: f("2026-11-12 05:10"),
      time_out: f("2026-11-12 14:02"),
      weight_in_kg: f(197000),
      weight_out_kg: f(46950),
      net_kg: f(150050),
      container_no: f(null, 0),
      driver_combined: f("Б.Батбаяр, УБ90010101, 99112233"),
      trailer_plate_1: f("1234 Ч-А"),
      trailer_plate_2: f("1235 Ч-А"),
      contract_no: f("NGR-2026/01", 0.45),
      loading_place: f("Нагааранз", 0.7),
      destination: f("Гашуунсухайт"),
      c_permit: f("C-0457"),
      seal_no: f("883120"),
      printed_at: f("2026-11-12 14:05"),
      weigher_name: f("Д.Сараа"),
      obscured_fields: ["contract_no"],
    },
  };
}
