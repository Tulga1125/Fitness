import { valueAt, type Dated } from "./history";

export type Currency = "MNT" | "CNY";

/** Exchange rates: how many MNT one unit of the currency buys, over time. */
export type FxTable = Partial<Record<Currency, Dated<number>[]>>;

/** Convert an amount to whole MNT using the rate in force at `at`. Throws when no rate exists. */
export function toMnt(amount: number, currency: Currency, at: Date, fx: FxTable): number {
  if (currency === "MNT") return Math.round(amount);
  const rate = valueAt(fx[currency] ?? [], at);
  if (rate == null) throw new Error(`No ${currency}→MNT rate on ${at.toISOString()}`);
  return Math.round(amount * rate);
}

/** Round to 2 decimals for foreign-currency amounts (fen). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
