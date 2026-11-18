// Asia/Ulaanbaatar is UTC+8 with no daylight saving time.
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) of an instant, as seen in Ulaanbaatar. */
export function ubDate(d: Date): string {
  return new Date(d.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight Ulaanbaatar time of a YYYY-MM-DD date, as an instant. */
export function ubMidnight(date: string): Date {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - UB_OFFSET_MS);
}
