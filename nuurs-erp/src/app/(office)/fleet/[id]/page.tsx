import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDate, fmtMnt } from "@/lib/format";
import { addPolicy } from "../../../actions/fleet";
import { CoverBadge } from "../CoverBadge";

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("fleet.view");
  const { id } = await params;
  const sp = await searchParams;
  const v = await db.vehicle.findFirst({
    where: { id, companyId: user.companyId },
    include: { policies: { where: { deletedAt: null }, include: { insurer: true }, orderBy: { endDate: "desc" } } },
  });
  if (!v) notFound();
  const insurers = await db.counterparty.findMany({ where: { companyId: user.companyId, type: "INSURER", deletedAt: null } });
  const money = can(user.role, "money.view") || can(user.role, "insurance.edit");

  return (
    <>
      <p><Link href="/fleet">← {mn.nav.fleet}</Link></p>
      <h2>{v.plateNo} <span className="badge">{mn.vehicleKind[v.kind]}</span> <CoverBadge end={v.policies[0]?.endDate ?? null} /></h2>
      {sp.error && <p className="error">{sp.error}</p>}
      <div className="grid">
        <div className="panel kpi"><div className="label">Марк</div><div className="value" style={{ fontSize: 18 }}>{[v.make, v.model, v.year].filter(Boolean).join(" ") || "—"}</div></div>
        <div className="panel kpi"><div className="label">Түлшний сав</div><div className="value" style={{ fontSize: 18 }}>{v.fuelTankLitres ? `${v.fuelTankLitres} л` : "—"}</div></div>
        <div className="panel kpi"><div className="label">Үзлэг дуусах</div><div className="value" style={{ fontSize: 18 }}>{fmtDate(v.inspectionExpiry)}</div></div>
        <div className="panel kpi"><div className="label">С зөвшөөрөл</div><div className="value" style={{ fontSize: 18 }}>{v.cPermitNo ?? "—"}</div><div className="muted">{fmtDate(v.cPermitExpiry)}</div></div>
      </div>

      <h3>Даатгал</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Төрөл</th><th>Дугаар</th><th>Даатгагч</th><th>Эхлэх</th><th>Дуусах</th>{money && <th className="num">Хураамж</th>}<th>Гэрээ</th></tr></thead>
          <tbody>
            {v.policies.length === 0 && <tr><td colSpan={7} className="muted">Даатгал бүртгэгдээгүй</td></tr>}
            {v.policies.map((pol) => (
              <tr key={pol.id}>
                <td>{mn.policyType[pol.policyType]}</td>
                <td>{pol.policyNo ?? "—"}</td>
                <td>{pol.insurer?.name ?? "—"}</td>
                <td>{fmtDate(pol.startDate)}</td>
                <td>{fmtDate(pol.endDate)}</td>
                {money && <td className="num">{fmtMnt(pol.premiumMnt)}</td>}
                <td>{pol.contractFileId ? <a href={`/files/${pol.contractFileId}`} target="_blank">Нээх</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {can(user.role, "insurance.edit") && (
        <>
          <h3>Шинэ даатгал нэмэх</h3>
          <form action={addPolicy} className="panel stack">
            <input type="hidden" name="vehicleId" value={v.id} />
            <div className="fields2">
              <label>Төрөл
                <select name="policyType" defaultValue="DRIVER_LIABILITY">
                  {Object.entries(mn.policyType).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label>Дугаар<input name="policyNo" /></label>
              <label>Даатгагч
                <select name="insurerId" defaultValue="">
                  <option value="">—</option>
                  {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <label>Хураамж, ₮<input name="premiumMnt" inputMode="numeric" /></label>
              <label>Эхлэх<input type="date" name="startDate" required /></label>
              <label>Дуусах<input type="date" name="endDate" required /></label>
              <label>Гэрээний хуулбар (зураг)<input type="file" name="contractFile" accept="image/*" /></label>
            </div>
            <div><button type="submit">Нэмэх</button></div>
          </form>
        </>
      )}
    </>
  );
}
