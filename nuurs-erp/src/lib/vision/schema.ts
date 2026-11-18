import { z } from "zod/v4";

/** Every extracted field comes with the model's confidence between 0 and 1. Unreadable → null. */
const field = <T extends z.ZodType>(t: T) =>
  z.object({ value: t.nullable(), confidence: z.number() });

const str = () => field(z.string());
const int = () => field(z.number().int());

/** Fields printed on a weighbridge ticket (spec §3). */
export const TicketFields = z.object({
  operator_name: str(),
  ticket_no: str(),
  consignor: str(),
  buyer: str(),
  carrier: str(),
  /** "БУУЛГАЛТ" (unloading) or "АЧИЛТ" (loading) as printed */
  kind: field(z.enum(["LOAD", "UNLOAD"])),
  ticket_datetime: str(),
  product: str(),
  tractor_plate: str(),
  time_in: str(),
  time_out: str(),
  weight_in_kg: int(),
  weight_out_kg: int(),
  net_kg: int(),
  container_no: str(),
  /** Name, register number and phone printed together, comma-separated */
  driver_combined: str(),
  trailer_plate_1: str(),
  trailer_plate_2: str(),
  contract_no: str(),
  loading_place: str(),
  destination: str(),
  c_permit: str(),
  seal_no: str(),
  printed_at: str(),
  weigher_name: str(),
  /** Names of fields covered by a stamp, fold or glare */
  obscured_fields: z.array(z.string()),
});

/** A fuel receipt or a photo of the pump meter. */
export const FuelFields = z.object({
  station: str(),
  plate: str(),
  litres: field(z.number()),
  unit_price: field(z.number()),
  currency: field(z.enum(["MNT", "CNY"])),
  amount: field(z.number()),
  filled_at: str(),
  payment_method: str(),
  obscured_fields: z.array(z.string()),
});

export const Extraction = z.object({
  document_type: z.enum(["weigh_ticket", "fuel_receipt", "pump_meter", "other"]),
  ticket: TicketFields.nullable(),
  fuel: FuelFields.nullable(),
});

export type Extraction = z.infer<typeof Extraction>;
export type TicketExtraction = z.infer<typeof TicketFields>;
export type FuelExtraction = z.infer<typeof FuelFields>;
