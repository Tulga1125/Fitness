import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDate, fmtMnt, fmtNum, fmtTonnes } from "@/lib/format";
import { monthPeriod } from "@/lib/period";
import { OPEN_STATUSES } from "@/lib/services/trips";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("dashboard.view");
  const money = can(user.role, "money.view");
  const p = monthPeriod((await searchParams).month);
  const companyId = user.companyId;
  const soon = new Date(Date.now() + 30 * 86_400_000);

  const [trips, openTrips, pendingTickets, pendingFuel, failedUploads, expiring, contracts] = await Promise.all([
    db.trip.findMany({ where: { companyId, deletedAt: null, unloadedAt: { gte: p.from, lt: p.to } } }),
    db.trip.groupBy({ by: ["status"], where: { companyId, deletedAt: null, status: { in: OPEN_STATUSES } }, _count: true }),
    db.weighTicket.count({ where: { companyId, status: "PENDING", deletedAt: null } }),
    db.fuelEntry.count({ where: { companyId, status: "PENDING", deletedAt: null } }),
    db.upload.count({ where: { companyId, status: "FAILED" } }),
    db.insurancePolicy.findMany({
      where: { companyId, deletedAt: null, endDate: { lte: soon } },
      include: { vehicle: true },
      orderBy: { endDate: "asc" },
    }),
    db.contract.findMany({ where: { companyId, deletedAt: null } }),
  ]);
  // Only the latest policy of each vehicle and type matters for warnings.
  const latest = new Map<string, (typeof expiring)[number]>();
  for (const pol of expiring) latest.set(`${pol.vehicleId}:${pol.policyType}`, pol);
  const renewed = await db.insurancePolicy.findMany({ where: { companyId, deletedAt: null, endDate: { gt: soon } }, select: { vehicleId: true, policyType: true } });
  const renewedKeys = new Set(renewed.map((r) => `${r.vehicleId}:${r.policyType}`));
  const warnings = [...latest.values()].filter((pol) => !renewedKeys.has(`${pol.vehicleId}:${pol.policyType}`));

  const sum = (f: (t: (typeof trips)[number]) => number | null) => trips.reduce((s, t) => s + (f(t) ?? 0), 0);
  const tonnesKg = sum((t) => t.unloadedNetKg);
  const revenue = sum((t) => t.revenueMnt);
  const fuelCost = sum((t) => t.fuelCostMnt);
  const margin = sum((t) => t.marginMnt);
  const estimated = trips.some((t) => t.fuelCostEstimated);
  const noContract = trips.filter((t) => !t.contractId).length;

  const byContract = contracts
    .map((c) => {
      const ts = trips.filter((t) => t.contractId === c.id);
      return {
        c,
        n: ts.length,
        kg: ts.reduce((s, t) => s + (t.unloadedNetKg ?? 0), 0),
        revenue: ts.reduce((s, t) => s + (t.revenueMnt ?? 0), 0),
        fuel: ts.reduce((s, t) => s + t.fuelCostMnt, 0),
        margin: ts.reduce((s, t) => s + (t.marginMnt ?? 0), 0),
      };
    })
    .filter((r) => r.n > 0);

  return (
    <>
      <h2>{mn.nav.dashboard}</h2>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href={`/?month=${p.prevMonth}`}>← {p.prevMonth}</Link>
        <strong>{p.month}</strong>
        <Link href={`/?month=${p.nextMonth}`}>{p.nextMonth} →</Link>
      </div>

      <div className="grid">
        <div className="panel kpi"><div className="label">Буулгасан рейс</div><div className="value">{trips.length}</div></div>
        <div className="panel kpi"><div className="label">Тээвэрлэсэн</div><div className="value">{fmtTonnes(tonnesKg)}</div></div>
        {money && (
          <>
            <div className="panel kpi"><div className="label">{mn.money.revenue}</div><div className="value">{fmtMnt(revenue)}</div></div>
            <div className="panel kpi"><div className="label">{mn.money.fuelCost}{estimated && ` (${mn.money.estimated})`}</div><div className="value">{fmtMnt(fuelCost)}</div></div>
            <div className="panel kpi">
              <div className="label">{mn.money.margin}</div>
              <div className="value">{fmtMnt(margin)}</div>
              <div className="muted">{revenue > 0 ? `${fmtNum((margin / revenue) * 100, 1)}%` : ""}</div>
            </div>
            <div className="panel kpi"><div className="label">Орлого / тонн</div><div className="value">{tonnesKg > 0 ? fmtMnt(revenue / (tonnesKg / 1000)) : "—"}</div></div>
          </>
        )}
      </div>
      {money && <p className="muted">{mn.money.marginNote}</p>}
      {money && noContract > 0 && <p className="error">{noContract} рейс гэрээгүй тул орлого тооцогдоогүй. <Link href="/trips?filter=nocontract">Харах</Link></p>}

      <h3>Өнөөдөр</h3>
      <div className="grid">
        {OPEN_STATUSES.map((s) => (
          <div className="panel kpi" key={s}>
            <div className="label">{mn.tripStatus[s]}</div>
            <div className="value">{openTrips.find((o) => o.status === s)?._count ?? 0}</div>
          </div>
        ))}
        <div className="panel kpi"><div className="label">Батлах хүлээгдэж буй</div><div className="value"><Link href="/approvals">{pendingTickets + pendingFuel}</Link></div></div>
        <div className="panel kpi"><div className="label">Уншиж чадаагүй зураг</div><div className="value"><Link href="/upload">{failedUploads}</Link></div></div>
      </div>

      {money && byContract.length > 0 && (
        <>
          <h3>Гэрээгээр</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Гэрээ</th><th className="num">Рейс</th><th className="num">Тонн</th><th className="num">{mn.money.revenue}</th><th className="num">{mn.money.fuelCost}</th><th className="num">{mn.money.margin}</th><th className="num">%</th></tr></thead>
              <tbody>
                {byContract.map((r) => (
                  <tr key={r.c.id}>
                    <td><Link href={`/trips?contract=${r.c.id}&month=${p.month}`}>{r.c.name}</Link></td>
                    <td className="num">{r.n}</td>
                    <td className="num">{fmtNum(r.kg / 1000, 2)}</td>
                    <td className="num">{fmtMnt(r.revenue)}</td>
                    <td className="num">{fmtMnt(r.fuel)}</td>
                    <td className="num">{fmtMnt(r.margin)}</td>
                    <td className="num">{r.revenue > 0 ? fmtNum((r.margin / r.revenue) * 100, 1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Уурхайгаар хуваасан түлш нь машины рейсээр холбогдсон тул өөр уурхайн колонкоос авсан түлш тухайн машины рейсэд орно.</p>
        </>
      )}

      <h3>Анхааруулга: 30 хоногт дуусах даатгал</h3>
      {warnings.length === 0 ? (
        <p className="muted">Алга</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Машин</th><th>Төрөл</th><th>Дуусах</th><th></th></tr></thead>
            <tbody>
              {warnings.map((w) => (
                <tr key={w.id}>
                  <td><Link href={`/fleet/${w.vehicleId}`}>{w.vehicle.plateNo}</Link></td>
                  <td>{mn.policyType[w.policyType]}</td>
                  <td>{fmtDate(w.endDate)}</td>
                  <td><span className={`badge ${w.endDate < new Date() ? "bad" : "warn"}`}>{w.endDate < new Date() ? "Дууссан" : "Дуусах гэж байна"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
