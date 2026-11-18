import { valueAt, type Dated } from "./history";
import type { Currency } from "./money";

export type RateType = "PER_TONNE" | "PER_TONNE_KM" | "PER_TRIP";
export type WeightBasis = "LOADED" | "UNLOADED";

export type ContractTerms = {
  rateType: RateType;
  currency: Currency;
  /** Rate over time. A contract rate can change (e.g. Цагаан залаат 115 → 120 CNY/t). */
  rates: Dated<number>[];
  billableWeightBasis: WeightBasis;
  distanceKm?: number | null;
};

export type TripWeights = {
  loadedAt: Date | null;
  unloadedAt: Date | null;
  loadedNetKg: number | null;
  unloadedNetKg: number | null;
};

/** The date that picks the contract rate: the loading date, else the unloading date. */
export function rateDate(trip: TripWeights): Date | null {
  return trip.loadedAt ?? trip.unloadedAt;
}

export function billableKg(contract: ContractTerms, trip: TripWeights): number | null {
  return contract.billableWeightBasis === "LOADED" ? trip.loadedNetKg : trip.unloadedNetKg;
}

export type Revenue = { amount: number; currency: Currency; rate: number; billableKg: number | null };

/**
 * Revenue in the contract currency.
 * per tonne: tonnes × rate; per tonne-km: tonnes × km × rate; per trip: the rate.
 * Returns null when the trip has no weight or date yet, or no rate was in force.
 */
export function tripRevenue(contract: ContractTerms, trip: TripWeights): Revenue | null {
  const at = rateDate(trip);
  if (!at) return null;
  const rate = valueAt(contract.rates, at);
  if (rate == null) return null;
  if (contract.rateType === "PER_TRIP") {
    return { amount: rate, currency: contract.currency, rate, billableKg: billableKg(contract, trip) };
  }
  const kg = billableKg(contract, trip);
  if (kg == null) return null;
  const tonnes = kg / 1000;
  const km = contract.rateType === "PER_TONNE_KM" ? (contract.distanceKm ?? 0) : 1;
  return { amount: tonnes * km * rate, currency: contract.currency, rate, billableKg: kg };
}

/** Revenue difference when trips were recorded at a rate other than the contract rate. */
export function rateMismatchAmount(totalKg: number, recordedRate: number, contractRate: number): number {
  return (totalKg / 1000) * (contractRate - recordedRate);
}
