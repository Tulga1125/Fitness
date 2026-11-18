import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDateTime, fmtKg, fmtNum } from "@/lib/format";

export default async function ApprovalsPage() {
  const user = await requirePermission("docs.view");
  const [tickets, fuel] = await Promise.all([
    db.weighTicket.findMany({ where: { companyId: user.companyId, status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" } }),
    db.fuelEntry.findMany({ where: { companyId: user.companyId, status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <h2>{mn.nav.approvals}</h2>
      <p className="muted">Хүлээгдэж буй бичлэг нь батлагдах хүртэл орлого, түлш, тайланд тооцогдохгүй.</p>

      <h3>Пүүний баримт ({tickets.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Ирсэн</th><th>Төрөл</th><th>Баримт №</th><th>Толгой</th><th className="num">Ачаа жин</th><th>Анхаарах</th></tr>
          </thead>
          <tbody>
            {tickets.length === 0 && <tr><td colSpan={6} className="muted">Хүлээгдэж буй баримт алга</td></tr>}
            {tickets.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/approvals/ticket/${t.id}`}>{fmtDateTime(t.createdAt)}</Link></td>
                <td>{mn.ticketKind[t.kind]}</td>
                <td>{t.ticketNo ?? "—"}</td>
                <td>{t.tractorPlate ?? "—"}</td>
                <td className="num">{fmtKg(t.netKg)}</td>
                <td>{t.lowConfidenceFields.length > 0 && <span className="badge warn">{t.lowConfidenceFields.length} талбар</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Түлш ({fuel.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Огноо</th><th>Машин</th><th className="num">Литр</th><th>Колонк</th><th>Анхаарах</th></tr>
          </thead>
          <tbody>
            {fuel.length === 0 && <tr><td colSpan={5} className="muted">Хүлээгдэж буй бичлэг алга</td></tr>}
            {fuel.map((f) => (
              <tr key={f.id}>
                <td><Link href={`/approvals/fuel/${f.id}`}>{fmtDateTime(f.filledAt)}</Link></td>
                <td>{f.plateRaw ?? <span className="badge bad">дугааргүй</span>}</td>
                <td className="num">{fmtNum(f.litres)}</td>
                <td>{f.stationRaw ?? "—"}</td>
                <td>{f.lowConfidenceFields.length > 0 && <span className="badge warn">{f.lowConfidenceFields.length} талбар</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
