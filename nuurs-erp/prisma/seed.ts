// Demo company seeded from the October–November 2026 report of Сүндэр Ложистик ХХК.
// Run: npm run db:seed   (idempotent: it refuses to run twice on the same database)
import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { reassignFuelAndRecalc } from "../src/lib/services/trips";

const db = new PrismaClient();
const ub = (s: string) => new Date(`${s}+08:00`);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

async function main() {
  if (await db.company.findFirst()) {
    console.log("Database already has a company; seed skipped.");
    return;
  }
  const company = await db.company.create({ data: { name: "Сүндэр Ложистик ХХК" } });
  const companyId = company.id;

  // Reference data from the report.
  await db.exchangeRate.create({ data: { companyId, currency: "CNY", validFrom: "2026-01-01", rateToMnt: 540 } });
  await db.fuelNorm.createMany({
    data: [
      { companyId, validFrom: "2026-01-01", litresPerTrip: 600, note: "Зуны норм" },
      { companyId, validFrom: "2026-11-01", litresPerTrip: 650, note: "Өвлийн хуваарь" },
    ],
  });
  await db.setting.create({ data: { companyId, key: "fuel.defaultPriceMnt", value: "6000" } });

  // Users: one per role. Office staff use a password, drivers a PIN.
  const pw = await hashPassword("demo1234");
  const pin = await hashPassword("1234");
  await db.user.createMany({
    data: [
      { companyId, name: "Захирал", phone: "99000001", role: "DIRECTOR", passwordHash: pw },
      { companyId, name: "Нягтлан", phone: "99000002", role: "ACCOUNTANT", passwordHash: pw },
      { companyId, name: "Менежер", phone: "99000003", role: "MANAGER", passwordHash: pw },
      { companyId, name: "Талбайн менежер", phone: "99000004", role: "SITE_MANAGER", passwordHash: pw },
    ],
  });

  // Places.
  const loc = async (name: string, type: Prisma.LocationCreateInput["type"], extra: Partial<Prisma.LocationUncheckedCreateInput> = {}) =>
    db.location.create({ data: { companyId, name, type, ...extra } });
  const mines = {
    ngr: await loc("Нагааранз", "MINE"),
    tz: await loc("Цагаан залаат", "MINE"),
    ud: await loc("Үнээтийн дэл", "MINE"),
    at: await loc("Алаг тогоо", "MINE"),
  };
  const port = await loc("Гашуунсухайт", "BORDER_PORT");
  await loc("Нагааранз ШТС", "FUEL_STATION", { fuelPrice: 9.007, fuelCurrency: "CNY" });
  await loc("Мөрөн колонк", "FUEL_STATION");

  // Contracts: rate per tonne in CNY, VAT included, billed on the unloading weighbridge weight.
  const contract = async (no: string, name: string, origin: { id: string }, rates: [string, number][]) => {
    const route = await db.route.create({ data: { companyId, name: `${name} → Гашуунсухайт`, originId: origin.id, destinationId: port.id, borderPort: "Гашуунсухайт" } });
    return db.contract.create({
      data: {
        companyId, contractNo: no, name, routeId: route.id, rateType: "PER_TONNE", currency: "CNY", vatIncluded: true,
        billableWeightBasis: "UNLOADED", product: "Нүүрс", startDate: ub("2026-01-01T00:00:00"), status: "ACTIVE",
        rates: { create: rates.map(([validFrom, rate]) => ({ validFrom, rate })) },
      },
    });
  };
  const contracts = {
    ngr: await contract("NGR-2026/01", "Нагааранз", mines.ngr, [["2026-01-01", 115]]),
    // The rate changed over time: 115 in October, 120 from November.
    tz: await contract("TZ-2026/01", "Цагаан залаат", mines.tz, [["2026-10-01", 115], ["2026-11-01", 120]]),
    ud: await contract("UD-2026/01", "Үнээтийн дэл", mines.ud, [["2026-01-01", 143]]),
    at: await contract("AT-2026/01", "Алаг тогоо", mines.at, [["2026-01-01", 130]]),
  };

  // Fleet: tractors from the report, two trailers each, one driver each.
  const insurer = await db.counterparty.create({ data: { companyId, name: "Монгол Даатгал ХК", type: "INSURER" } });
  const fleet: { plate: string; driver: string; phone: string; trailers: [string, string]; contract: keyof typeof contracts }[] = [
    { plate: "3341ӨМН", driver: "Б.Батбаяр", phone: "99112233", trailers: ["1234ЧА", "1235ЧА"], contract: "ngr" },
    { plate: "5633ӨМН", driver: "Д.Ганболд", phone: "99112234", trailers: ["1236ЧА", "1237ЧА"], contract: "tz" },
    { plate: "2548УБЭ", driver: "С.Энхтөр", phone: "99112235", trailers: ["1238ЧА", "1239ЧА"], contract: "ngr" },
    { plate: "2053ӨМН", driver: "Ж.Мөнхбат", phone: "99112236", trailers: ["1240ЧА", "1241ЧА"], contract: "ud" },
    { plate: "8521ӨМЭ", driver: "Л.Төмөр", phone: "99112237", trailers: ["1242ЧА", "1243ЧА"], contract: "at" },
  ];
  const tractors: Record<string, string> = {};
  for (const [i, f] of fleet.entries()) {
    const tractor = await db.vehicle.create({ data: { companyId, kind: "TRACTOR", plateNo: f.plate, make: "Howo", fuelTankLitres: 800, inspectionExpiry: daysFromNow(120) } });
    const t1 = await db.vehicle.create({ data: { companyId, kind: "TRAILER", plateNo: f.trailers[0] } });
    const t2 = await db.vehicle.create({ data: { companyId, kind: "TRAILER", plateNo: f.trailers[1] } });
    const driver = await db.driver.create({ data: { companyId, fullName: f.driver, phone: f.phone, wechatDisplayName: `${f.plate} ${f.driver}` } });
    await db.user.create({ data: { companyId, name: f.driver, phone: f.phone, role: "DRIVER", passwordHash: pin, driverId: driver.id } });
    await db.rig.create({ data: { companyId, tractorId: tractor.id, trailer1Id: t1.id, trailer2Id: t2.id, driverId: driver.id, validFrom: ub("2026-01-01T00:00:00") } });
    // Insurance: the first tractor's policy ends in 7 days, so it shows in the warnings.
    await db.insurancePolicy.create({
      data: {
        companyId, vehicleId: tractor.id, insurerId: insurer.id, policyType: "DRIVER_LIABILITY", policyNo: `ЖДД-${1000 + i}`,
        startDate: daysFromNow(i === 0 ? -358 : -100), endDate: daysFromNow(i === 0 ? 7 : 265), premiumMnt: 450_000,
      },
    });
    tractors[f.plate] = tractor.id;
  }

  // A few closed-out trips with approved tickets and fuel, so the dashboard has numbers.
  const accountant = await db.user.findFirstOrThrow({ where: { companyId, role: "ACCOUNTANT" } });
  let n = 0;
  const trip = async (plate: string, c: keyof typeof contracts, loaded: string, unloaded: string, netKg: number, fuel: [string, number, number | null][]) => {
    n += 1;
    const tractorId = tractors[plate];
    const rig = await db.rig.findFirstOrThrow({ where: { tractorId } });
    const t = await db.trip.create({
      data: {
        companyId, tripNo: `R2026-${String(n).padStart(5, "0")}`, contractId: contracts[c].id, routeId: contracts[c].routeId,
        tractorId, trailer1Id: rig.trailer1Id, trailer2Id: rig.trailer2Id, driverId: rig.driverId, createdBy: "seed",
        status: "COMPLETED", startedAt: ub(loaded), loadedAt: ub(loaded), unloadedAt: ub(unloaded), loadedNetKg: netKg + 600, unloadedNetKg: netKg,
      },
    });
    await db.weighTicket.create({
      data: {
        companyId, tripId: t.id, kind: "UNLOAD", ticketNo: `DEMO${n}`, operatorName: "Пүү Оператор ХХК", tractorPlate: plate,
        trailerPlates: [], weightInKg: netKg + 46950, weightOutKg: 46950, netKg, timeOut: ub(unloaded), source: "IMPORT",
        status: "APPROVED", approvedById: accountant.id, approvedAt: new Date(),
      },
    });
    for (const [when, litres, priceCny] of fuel) {
      await db.fuelEntry.create({
        data: {
          companyId, tractorId, plateRaw: plate, litres, filledAt: ub(when), unitPrice: priceCny, currency: priceCny ? "CNY" : null,
          source: "IMPORT", status: "APPROVED", approvedById: accountant.id, approvedAt: new Date(),
        },
      });
    }
  };
  await trip("3341ӨМН", "ngr", "2026-11-02T08:00:00", "2026-11-03T14:00:00", 150050, [["2026-11-02T06:00:00", 700, 9.007]]);
  await trip("3341ӨМН", "ngr", "2026-11-05T08:00:00", "2026-11-06T13:00:00", 149800, [["2026-11-05T06:30:00", 650, 9.007]]);
  await trip("5633ӨМН", "tz", "2026-10-20T08:00:00", "2026-10-21T15:00:00", 124600, [["2026-10-20T06:00:00", 600, null]]);
  await trip("5633ӨМН", "tz", "2026-11-08T08:00:00", "2026-11-09T12:00:00", 125100, [["2026-11-08T07:00:00", 650, null]]);
  await trip("2053ӨМН", "ud", "2026-11-10T08:00:00", "2026-11-11T16:00:00", 131200, [["2026-11-10T07:00:00", 400, null]]);
  await trip("2548УБЭ", "ngr", "2026-11-05T09:00:00", "2026-11-06T15:00:00", 150300, [["2026-11-05T07:00:00", 650, 9.007]]);
  // Fuel after 2548УБЭ's last unloading: its trip is not registered yet (pending).
  await db.fuelEntry.create({
    data: { companyId, tractorId: tractors["2548УБЭ"], plateRaw: "2548УБЭ", litres: 650, filledAt: ub("2026-11-12T08:00:00"), source: "IMPORT", status: "APPROVED", approvedById: accountant.id, approvedAt: new Date() },
  });
  // 8521ӨМЭ took fuel with no trip at all.
  await db.fuelEntry.create({
    data: { companyId, tractorId: tractors["8521ӨМЭ"], plateRaw: "8521ӨМЭ", litres: 400, filledAt: ub("2026-11-14T10:00:00"), stationRaw: "Алаг тогоо", source: "IMPORT", status: "APPROVED", approvedById: accountant.id, approvedAt: new Date() },
  });
  // Fuel with no plate.
  await db.fuelEntry.create({
    data: { companyId, litres: 100, filledAt: ub("2026-10-29T10:00:00"), stationRaw: "Алаг тогоо", source: "IMPORT", status: "APPROVED", approvedById: accountant.id, approvedAt: new Date() },
  });

  for (const id of Object.values(tractors)) {
    await db.$transaction((tx) => reassignFuelAndRecalc(tx, companyId, id));
  }
  console.log("Seeded Сүндэр Ложистик ХХК. Office login: 99000001–99000004 / demo1234; drivers: 99112233… / PIN 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
