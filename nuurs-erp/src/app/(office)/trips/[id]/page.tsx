import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { weightLoss } from "@/lib/calc";
import { fmtDateTime, fmtKg, fmtMnt, fmtNum } from "@/lib/format";
import { closeTrip, setTripContract } from "../../../actions/trips";

export default async function TripDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("trips.view");
  const money = can(user.role, "money.view");
  const { id } = await params;
  const sp = await searchParams;
  const t = await db.trip.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      tractor: true, trailer1: true, trailer2: true, driver: true, contract: true, route: true,
      weighTickets: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      fuelEntries: { where: { deletedAt: null }, orderBy: { filledAt: "asc" } },
    },
  });
  if (!t) notFound();
  const contracts = can(user.role, "trips.edit") ? await db.contract.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" } }) : [];
  const loss = t.loadedNetKg && t.unloadedNetKg ? weightLoss(t.loadedNetKg, t.unloadedNetKg) : null;

  return (
    <>
      <p><Link href="/trips">← {mn.nav.trips}</Link></p>
      <h2>Рейс {t.tripNo} <span className="badge">{mn.tripStatus[t.status]}</span></h2>
      {sp.error && <p className="error">{sp.error}</p>}
      {t.createdBy === "auto" && <p className="error">Систем автоматаар үүсгэсэн рейс. Менежер гэрээг нь баталгаажуулна уу.</p>}

      <div className="grid">
        <div className="panel kpi"><div className="label">Машин</div><div className="value">{t.tractor.plateNo}</div><div className="muted">{[t.trailer1?.plateNo, t.trailer2?.plateNo].filter(Boolean).join(" + ")}</div></div>
        <div className="panel kpi"><div className="label">Жолооч</div><div className="value" style={{ fontSize: 18 }}>{t.driver?.fullName ?? "—"}</div></div>
        <div className="panel kpi"><div className="label">Ачилт</div><div className="value" style={{ fontSize: 18 }}>{fmtKg(t.loadedNetKg)}</div><div className="muted">{fmtDateTime(t.loadedAt)}</div></div>
        <div className="panel kpi"><div className="label">Буулгалт</div><div className="value" style={{ fontSize: 18 }}>{fmtKg(t.unloadedNetKg)}</div><div className="muted">{fmtDateTime(t.unloadedAt)}</div></div>
        {loss && <div className="panel kpi"><div className="label">Жингийн хорогдол</div><div className="value" style={{ fontSize: 18 }}>{fmtKg(loss.kg)}</div><div className="muted">{fmtNum(loss.percent, 2)}%</div></div>}
      </div>

      <h3>Гэрээ</h3>
      <div className="panel">
        {t.contract ? (
          <div>{t.contract.name} · {t.contract.contractNo} · {mn.rateType[t.contract.rateType]}, {mn.weightBasis[t.contract.billableWeightBasis]}</div>
        ) : <div className="error">Гэрээгүй — орлого тооцогдохгүй</div>}
        {can(user.role, "trips.edit") && t.status !== "CLOSED" && (
          <form action={setTripContract} className="row" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={t.id} />
            <select name="contractId" defaultValue={t.contractId ?? ""}>
              <option value="">— гэрээгүй —</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contractNo})</option>)}
            </select>
            <button type="submit">Хадгалах</button>
          </form>
        )}
      </div>

      {money && (
        <>
          <h3>Мөнгө</h3>
          <div className="grid">
            <div className="panel kpi">
              <div className="label">{mn.money.revenue}</div><div className="value">{fmtMnt(t.revenueMnt)}</div>
              {t.revenueForeign && <div className="muted">{fmtNum(Number(t.revenueForeign), 2)} {t.revenueCurrency} · {fmtNum(Number(t.rateApplied), 2)}/тн</div>}
            </div>
            <div className="panel kpi"><div className="label">{mn.money.fuelCost}{t.fuelCostEstimated ? ` (${mn.money.estimated})` : ""}</div><div className="value">{fmtMnt(t.fuelCostMnt)}</div><div className="muted">{fmtNum(t.fuelLitres)} л</div></div>
            <div className="panel kpi"><div className="label">{mn.money.margin}</div><div className="value">{fmtMnt(t.marginMnt)}</div></div>
            <div className="panel kpi"><div className="label">{mn.money.profit}</div><div className="value">{fmtMnt(t.profitMnt)}</div><div className="muted">цалин {fmtMnt(t.driverPayMnt)}, бусад {fmtMnt(t.otherCostMnt)}</div></div>
          </div>
          <p className="muted">{mn.money.marginNote}</p>
        </>
      )}

      <h3>Пүүний баримт</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Төрөл</th><th>Дугаар</th><th className="num">Ачаа жин</th><th>Гарсан</th><th>Төлөв</th></tr></thead>
          <tbody>
            {t.weighTickets.length === 0 && <tr><td colSpan={5} className="muted">Алга</td></tr>}
            {t.weighTickets.map((w) => (
              <tr key={w.id}>
                <td>{mn.ticketKind[w.kind]}</td>
                <td><Link href={`/approvals/ticket/${w.id}`}>{w.ticketNo ?? "—"}</Link></td>
                <td className="num">{fmtKg(w.netKg)}</td>
                <td>{fmtDateTime(w.timeOut)}</td>
                <td>{mn.recordStatus[w.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Түлш</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Огноо</th><th className="num">Литр</th><th className="num">Үнэ</th><th>Колонк</th><th>Төлөв</th></tr></thead>
          <tbody>
            {t.fuelEntries.length === 0 && <tr><td colSpan={5} className="muted">Алга</td></tr>}
            {t.fuelEntries.map((f) => (
              <tr key={f.id}>
                <td><Link href={`/approvals/fuel/${f.id}`}>{fmtDateTime(f.filledAt)}</Link></td>
                <td className="num">{fmtNum(f.litres)}</td>
                <td className="num">{f.unitPrice ? `${f.unitPrice.toString()} ${f.currency ?? ""}` : "—"}</td>
                <td>{f.stationRaw ?? "—"}</td>
                <td>{mn.recordStatus[f.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {can(user.role, "trips.close") && t.status === "COMPLETED" && (
        <form action={closeTrip} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit">Рейсийг хаах</button> <span className="muted">Хаасны дараа тоо царцана.</span>
        </form>
      )}
    </>
  );
}
