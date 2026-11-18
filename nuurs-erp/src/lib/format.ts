import { ubDate } from "./calc/dates";

const group = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** 1234567 → "1 234 567 ₮" */
export function fmtMnt(n: number | null | undefined): string {
  return n == null ? "—" : `${group(n)} ₮`;
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  const [i, d] = Math.abs(n).toFixed(digits).split(".");
  return `${n < 0 ? "−" : ""}${group(Number(i))}${d ? "." + d : ""}`;
}

export function fmtKg(n: number | null | undefined): string {
  return n == null ? "—" : `${group(n)} кг`;
}

export function fmtTonnes(kg: number | null | undefined): string {
  return kg == null ? "—" : `${fmtNum(kg / 1000, 2)} тн`;
}

/** YYYY-MM-DD in Ulaanbaatar */
export function fmtDate(d: Date | null | undefined): string {
  return d ? ubDate(d) : "—";
}

/** YYYY-MM-DD HH:MM in Ulaanbaatar */
export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** Value for <input type="datetime-local"> in Ulaanbaatar time. */
export function toLocalInput(d: Date | null | undefined): string {
  return d ? new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 16) : "";
}

export function fromLocalInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
