import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { ContractTerms, Dated, FxTable } from "../calc";

type Tx = Prisma.TransactionClient | typeof db;

export async function loadFx(companyId: string, tx: Tx = db): Promise<FxTable> {
  const rows = await tx.exchangeRate.findMany({ where: { companyId } });
  const fx: FxTable = {};
  for (const r of rows) {
    (fx[r.currency] ??= []).push({ validFrom: r.validFrom, value: Number(r.rateToMnt) });
  }
  return fx;
}

export async function loadFuelNorms(companyId: string, tx: Tx = db): Promise<Dated<number>[]> {
  const rows = await tx.fuelNorm.findMany({ where: { companyId } });
  return rows.map((r) => ({ validFrom: r.validFrom, value: r.litresPerTrip }));
}

export const SETTING_DEFAULT_FUEL_PRICE = "fuel.defaultPriceMnt";

export async function loadDefaultFuelPrice(companyId: string, tx: Tx = db): Promise<number> {
  const s = await tx.setting.findUnique({ where: { companyId_key: { companyId, key: SETTING_DEFAULT_FUEL_PRICE } } });
  return s ? Number(s.value) : 6000;
}

export async function loadContractTerms(contractId: string, tx: Tx = db): Promise<ContractTerms | null> {
  const c = await tx.contract.findUnique({ where: { id: contractId }, include: { rates: true, route: true } });
  if (!c) return null;
  return {
    rateType: c.rateType,
    currency: c.currency,
    billableWeightBasis: c.billableWeightBasis,
    distanceKm: c.route?.distanceKm ?? null,
    rates: c.rates.map((r) => ({ validFrom: r.validFrom, value: Number(r.rate) })),
  };
}
