import { toMnt, type FxTable } from "./money";
import { tripRevenue, type ContractTerms, type TripWeights } from "./revenue";

export type TripFinancials = {
  revenueMnt: number | null;
  revenueForeign: { amount: number; currency: string; rate: number } | null;
  fuelCostMnt: number;
  fuelCostEstimated: boolean;
  driverPayMnt: number;
  otherCostMnt: number;
  /** «Ахиуц»: revenue − fuel. Not a profit: pay, repairs, tyres, insurance are left out. */
  marginMnt: number | null;
  /** revenue − fuel − driver pay − other trip costs. */
  profitMnt: number | null;
};

/** One place where a trip's money is computed. Inputs are approved records only. */
export function tripFinancials(input: {
  contract: ContractTerms | null;
  trip: TripWeights;
  fx: FxTable;
  fuelCosts: { mnt: number; estimated: boolean }[];
  driverPayMnt: number;
  otherCostsMnt: number[];
}): TripFinancials {
  const rev = input.contract ? tripRevenue(input.contract, input.trip) : null;
  const at = input.trip.loadedAt ?? input.trip.unloadedAt;
  const revenueMnt = rev && at ? toMnt(rev.amount, rev.currency, at, input.fx) : null;
  const fuelCostMnt = input.fuelCosts.reduce((s, f) => s + f.mnt, 0);
  const otherCostMnt = input.otherCostsMnt.reduce((s, n) => s + n, 0);
  return {
    revenueMnt,
    revenueForeign: rev && rev.currency !== "MNT" ? { amount: rev.amount, currency: rev.currency, rate: rev.rate } : null,
    fuelCostMnt,
    fuelCostEstimated: input.fuelCosts.some((f) => f.estimated),
    driverPayMnt: input.driverPayMnt,
    otherCostMnt,
    marginMnt: revenueMnt == null ? null : revenueMnt - fuelCostMnt,
    profitMnt: revenueMnt == null ? null : revenueMnt - fuelCostMnt - input.driverPayMnt - otherCostMnt,
  };
}
