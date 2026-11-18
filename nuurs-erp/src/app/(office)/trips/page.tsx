import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDate, fmtMnt, fmtNum, fmtTonnes } from "@/lib/format";
import { monthPeriod } from "@/lib/period";

export default async function TripsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("trips.view");
  const money = can(user.role, "money.view");
  const sp = await searchParams;
  const p = monthPeriod(sp.month);
  const q = (sp.q ?? "").trim().toUpperCase().replace(/\s/g, "");

  const where: Prisma.TripWhereInput = { companyId: user.companyId, deletedAt: null };
  if (sp.filter === "nocontract") where.contractId = null;
  else if (sp.filter === "open") where.status = { notIn: ["COMPLETED", "CLOSED"] };
  else where.OR = [{ unloadedAt: { gte: p.from, lt: p.to } }, { unloadedAt: null, createdAt: { gte: p.from, lt: p.to } }];
  if (sp.contract) where.contractId = sp.contract;
  if (q) where.tractor = { plateNo: { contains: q, mode: "insensitive" } };

  const [trips, contracts] = await Promise.all([
    db.trip.findMany({ where, include: { tractor: true, driver: true, contract: true }, orderBy: [{ unloadedAt: "desc" }, { createdAt: "desc" }], take: 500 }),
    db.contract.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <h2>{mn.nav.trips}</h2>
      <form className="row" style={{ marginBottom: 12 }}>
        <label>Сар<input type="month" name="month" defaultValue={p.month} /></label>
        <label>Гэрээ
          <select name="contract" defaultValue={sp.contract ?? ""}>
            <option value="">Бүгд</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Шүүлт
          <select name="filter" defaultValue={sp.filter ?? ""}>
            <option value="">Сараар</option>
            <option value="open">Нээлттэй</option>
            <option value="nocontract">Гэрээгүй</option>
          </select>
        </label>
        <label>Улсын дугаар<input name="q" defaultValue={sp.q ?? ""} placeholder="3341ӨМН" /></label>
        <button type="submit">Шүүх</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Рейс</th><th>Төлөв</th><th>Машин</th><th>Жолооч</th><th>Гэрээ</th><th>Буулгасан</th>
              <th className="num">Жин</th><th className="num">Түлш, л</th>
              {money && <><th className="num">{mn.money.revenue}</th><th className="num">{mn.money.margin}</th></>}
            </tr>
          </thead>
          <tbody>
            {trips.length === 0 && <tr><td colSpan={10} className="muted">Рейс алга</td></tr>}
            {trips.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/trips/${t.id}`}>{t.tripNo}</Link>{t.createdBy === "auto" && <> <span className="badge warn">авто</span></>}</td>
                <td>{mn.tripStatus[t.status]}</td>
                <td>{t.tractor.plateNo}</td>
                <td>{t.driver?.fullName ?? "—"}</td>
                <td>{t.contract?.name ?? <span className="badge bad">гэрээгүй</span>}</td>
                <td>{fmtDate(t.unloadedAt)}</td>
                <td className="num">{fmtTonnes(t.unloadedNetKg)}</td>
                <td className="num">{fmtNum(t.fuelLitres)}</td>
                {money && <><td className="num">{fmtMnt(t.revenueMnt)}</td><td className="num">{fmtMnt(t.marginMnt)}{t.fuelCostEstimated ? "*" : ""}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {money && <p className="muted">* түлшний үнэ ойролцоо. {mn.money.marginNote}</p>}
    </>
  );
}
