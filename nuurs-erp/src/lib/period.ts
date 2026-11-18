import { ubDate, ubMidnight } from "./calc/dates";

export type Period = { month: string; from: Date; to: Date; prevMonth: string; nextMonth: string };

function shift(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** A calendar month in Ulaanbaatar time; defaults to the current month. */
export function monthPeriod(month?: string | null): Period {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : ubDate(new Date()).slice(0, 7);
  return { month: m, from: ubMidnight(`${m}-01`), to: ubMidnight(`${shift(m, 1)}-01`), prevMonth: shift(m, -1), nextMonth: shift(m, 1) };
}
