import { ubDate } from "./dates";

/**
 * A value that changes over time: contract rates, fuel norms, exchange rates.
 * `validFrom` is a YYYY-MM-DD date in Ulaanbaatar; the value holds until the next entry.
 */
export type Dated<T> = { validFrom: string; value: T };

/** The value in force on the Ulaanbaatar calendar day of `at`, or null if none started yet. */
export function valueAt<T>(history: Dated<T>[], at: Date): T | null {
  const day = ubDate(at);
  let best: Dated<T> | null = null;
  for (const h of history) {
    if (h.validFrom <= day && (!best || h.validFrom > best.validFrom)) best = h;
  }
  return best ? best.value : null;
}
