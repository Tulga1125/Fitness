import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { vehicleNormReport, type FuelEntry, type TripSpan } from "@/lib/calc";
import { fmtDate, fmtNum } from "@/lib/format";
import { monthPeriod } from "@/lib/period";
import { loadFuelNorms } from "@/lib/services/reference";

/** Settings-to-be: thresholds for flagging a vehicle. */
const OVER_LITRES = 650; // one trip's worth over the norm
const UNDER_LITRES = -500; // fuel records possibly missing

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("fuelReport.view");
  const p = monthPeriod((await searchParams).month);
  const companyId = user.companyId;

  const [tripsRaw, fuelRaw, tractors, norms] = await Promise.all([
    db.trip.findMany({ where: { companyId, deletedAt: null, OR: [{ loadedAt: { gte: p.from, lt: p.to } }, { loadedAt: null, startedAt: { gte: p.from, lt: p.to } }] } }),
    db.fuelEntry.findMany({ where: { companyId, deletedAt: null, status: "APPROVED", filledAt: { gte: p.from, lt: p.to } } }),
    db.vehicle.findMany({ where: { companyId, kind: "TRACTOR" } }),
    loadFuelNorms(companyId),
  ]);
  // Fuel after the last trip of the month may belong to a trip the next month: include trips that
  // start after the period so the fuel is attached rather than shown as pending.
  const later = await db.trip.findMany({ where: { companyId, deletedAt: null, loadedAt: { gte: p.to } }, select: { id: true, tractorId: true, loadedAt: true, startedAt: true, unloadedAt: true } });
  const plate = new Map(tractors.map((t) => [t.id, t.plateNo]));
  const trips: TripSpan[] = tripsRaw.map((t) => ({ id: t.id, tractorId: t.tractorId, loadedAt: t.loadedAt, startedAt: t.startedAt, unloadedAt: t.unloadedAt }));
  const fuel: FuelEntry[] = fuelRaw.map((f) => ({ id: f.id, tractorId: f.tractorId, filledAt: f.filledAt, litres: f.litres, unitPrice: null, currency: null }));

  const { rows, assignment } = vehicleNormReport(trips, fuel, norms);
  const laterIds = new Set(later.map((t) => t.id));
  // Recompute with later trips only to find which "pending" fuel actually belongs to next month's trips.
  const withLater = vehicleNormReport([...trips, ...later.filter((t) => !trips.some((x) => x.id === t.id))], fuel, norms).assignment;
  const nextMonthLitres = [...withLater.byTrip.entries()].filter(([id]) => laterIds.has(id)).flatMap(([, ids]) => ids).reduce((s, id) => s + (fuel.find((f) => f.id === id)?.litres ?? 0), 0);

  const totalNorm = rows.reduce((s, r) => s + r.normLitres, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualLitres, 0);
  const totalPending = assignment.pending.reduce((s, e) => s + e.litres, 0);
  const totalAll = fuel.reduce((s, e) => s + e.litres, 0);
  const byId = new Map(fuelRaw.map((f) => [f.id, f]));

  return (
    <>
      <h2>{mn.nav.fuel}: норм ба гүйцэтгэл</h2>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href={`/fuel?month=${p.prevMonth}`}>← {p.prevMonth}</Link>
        <strong>{p.month}</strong>
        <Link href={`/fuel?month=${p.nextMonth}`}>{p.nextMonth} →</Link>
      </div>
      <p className="muted">
        Нормыг рейсийн ачилтын огноогоор ({norms.map((n) => `${n.validFrom}-ээс ${n.value} л`).join(", ")}), авсан түлшийг түлш авсан огноогоор тооцно.
        Рейсийн хооронд авсан түлш дараагийн рейсэд, сүүлийн буулгалтаас хойш авсан түлш «хүлээгдэж буй» болно.
      </p>

      <div className="grid">
        <div className="panel kpi"><div className="label">Нийт авсан түлш</div><div className="value">{fmtNum(totalAll)} л</div></div>
        <div className="panel kpi"><div className="label">Рейсэд холбогдсон</div><div className="value">{fmtNum(totalActual)} л</div><div className="muted">норм {fmtNum(totalNorm)} л</div></div>
        <div className="panel kpi"><div className="label">Нормоос</div><div className={`value ${totalActual - totalNorm > 0 ? "pos" : "neg"}`}>{totalActual - totalNorm > 0 ? "+" : ""}{fmtNum(totalActual - totalNorm)} л</div></div>
        <div className="panel kpi"><div className="label">Рейс нь бүртгэгдээгүй</div><div className="value">{fmtNum(totalPending)} л</div><div className="muted">{nextMonthLitres > 0 ? `${fmtNum(nextMonthLitres)} л нь дараа сарын рейсэд` : ""}</div></div>
      </div>

      <h3>Машин тус бүр</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Машин</th><th className="num">Рейс</th><th className="num">Норм, л</th><th className="num">Авсан, л</th><th className="num">Зөрүү, л</th><th className="num">Хүлээгдэж буй, л</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tractorId}>
                <td><Link href={`/trips?q=${encodeURIComponent(plate.get(r.tractorId) ?? "")}&month=${p.month}`}>{plate.get(r.tractorId) ?? "?"}</Link></td>
                <td className="num">{r.trips}</td>
                <td className="num">{fmtNum(r.normLitres)}</td>
                <td className="num">{fmtNum(r.actualLitres)}</td>
                <td className={`num ${r.diffLitres > 0 ? "pos" : "neg"}`}>{r.diffLitres > 0 ? "+" : ""}{fmtNum(r.diffLitres)}</td>
                <td className="num">{r.pendingLitres ? fmtNum(r.pendingLitres) : ""}</td>
                <td>
                  {r.diffLitres >= OVER_LITRES && <span className="badge bad">нормоос их</span>}
                  {r.diffLitres <= UNDER_LITRES && <span className="badge warn">дутуу бүртгэл байж болзошгүй</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Шалгах шаардлагатай</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Төрөл</th><th>Машин</th><th>Огноо</th><th className="num">Литр</th><th>Колонк</th></tr></thead>
          <tbody>
            {[
              ...assignment.noTrip.map((e) => ({ e, label: "Рейсгүй атлаа түлш авсан", cls: "bad" })),
              ...assignment.unassigned.map((e) => ({ e, label: "Машины дугааргүй", cls: "bad" })),
              ...assignment.pending.map((e) => ({ e, label: "Сүүлийн буулгалтаас хойш", cls: "warn" })),
            ].map(({ e, label, cls }) => (
              <tr key={e.id}>
                <td><span className={`badge ${cls}`}>{label}</span></td>
                <td>{e.tractorId ? plate.get(e.tractorId) : "—"}</td>
                <td><Link href={`/approvals/fuel/${e.id}`}>{fmtDate(e.filledAt)}</Link></td>
                <td className="num">{fmtNum(e.litres)}</td>
                <td>{byId.get(e.id)?.stationRaw ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
