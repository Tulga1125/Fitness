import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { checkTicketWeights } from "@/lib/calc";
import { fmtDateTime, fmtKg, toLocalInput } from "@/lib/format";
import { decideTicket } from "../../../../actions/docs";
import { ZoomImage } from "../../ZoomImage";

/** Extraction field name → form field name, for highlighting low-confidence inputs. */
const LOW_MAP: Record<string, string> = {
  ticket_no: "ticketNo", operator_name: "operatorName", kind: "kind", tractor_plate: "tractorPlate",
  trailer_plate_1: "trailer1", trailer_plate_2: "trailer2", contract_no: "contractNoRaw",
  weight_in_kg: "weightInKg", weight_out_kg: "weightOutKg", net_kg: "netKg",
  time_in: "timeIn", time_out: "timeOut", printed_at: "printedAt", ticket_datetime: "printedAt",
};

export default async function TicketReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requirePermission("docs.view");
  const { id } = await params;
  const sp = await searchParams;
  const t = await db.weighTicket.findFirst({ where: { id, companyId: user.companyId }, include: { trip: true } });
  if (!t) notFound();
  const log = await db.changeLog.findMany({ where: { tableName: "weigh_tickets", rowId: id }, orderBy: { changedAt: "asc" } });
  const low = new Set(t.lowConfidenceFields.map((f) => LOW_MAP[f] ?? f));
  const cls = (name: string) => (low.has(name) ? "low" : undefined);
  const check = checkTicketWeights(t);
  const pending = t.status === "PENDING";
  const mayApprove = pending && can(user.role, "docs.approve");
  const mayEdit = t.status === "APPROVED" && can(user.role, "docs.editApproved") && t.trip?.status !== "CLOSED";
  const editable = mayApprove || mayEdit;

  return (
    <>
      <p><Link href="/approvals">← {mn.nav.approvals}</Link></p>
      <h2>
        {mn.ticketKind[t.kind]} · {t.ticketNo ?? "дугааргүй"}{" "}
        <span className={`badge ${t.status === "APPROVED" ? "ok" : t.status === "REJECTED" ? "bad" : "warn"}`}>{mn.recordStatus[t.status]}</span>
      </h2>
      {sp.error && <p className="error">{sp.error}</p>}
      {sp.saved && <p className="notice">Засвар хадгалагдлаа</p>}
      {t.rejectReason && <p className="error">Татгалзсан: {t.rejectReason}</p>}

      <div className="review">
        <div className="photo panel">
          {t.imageFileId ? <ZoomImage src={`/files/${t.imageFileId}`} alt="Пүүний баримт" /> : <p className="muted">Зураггүй (импортоор орсон)</p>}
        </div>

        <div className="panel">
          {low.size > 0 && <p className="muted">Шараар тэмдэглэсэн талбарыг зурагтай тулгаж шалгана уу.</p>}
          <form action={decideTicket} className="stack">
            <input type="hidden" name="id" value={t.id} />
            <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10 }}>
              <div className="fields2">
                <label>{mn.fields.kind}
                  <select name="kind" defaultValue={t.kind} className={cls("kind")}>
                    <option value="UNLOAD">{mn.ticketKind.UNLOAD}</option>
                    <option value="LOAD">{mn.ticketKind.LOAD}</option>
                  </select>
                </label>
                <label>{mn.fields.ticketNo}<input name="ticketNo" defaultValue={t.ticketNo ?? ""} className={cls("ticketNo")} /></label>
                <label>{mn.fields.operatorName}<input name="operatorName" defaultValue={t.operatorName ?? ""} className={cls("operatorName")} /></label>
                <label>{mn.fields.tractorPlate}<input name="tractorPlate" defaultValue={t.tractorPlate ?? ""} className={cls("tractorPlate")} /></label>
                <label>{mn.fields.trailerPlates} 1<input name="trailer1" defaultValue={t.trailerPlates[0] ?? ""} className={cls("trailer1")} /></label>
                <label>{mn.fields.trailerPlates} 2<input name="trailer2" defaultValue={t.trailerPlates[1] ?? ""} className={cls("trailer2")} /></label>
                <label>{mn.fields.weightInKg}<input name="weightInKg" inputMode="numeric" defaultValue={t.weightInKg ?? ""} className={cls("weightInKg")} /></label>
                <label>{mn.fields.weightOutKg}<input name="weightOutKg" inputMode="numeric" defaultValue={t.weightOutKg ?? ""} className={cls("weightOutKg")} /></label>
                <label>{mn.fields.netKg}<input name="netKg" inputMode="numeric" defaultValue={t.netKg ?? ""} className={cls("netKg")} /></label>
                <label>{mn.fields.contractNoRaw}<input name="contractNoRaw" defaultValue={t.contractNoRaw ?? ""} className={cls("contractNoRaw")} /></label>
                <label>{mn.fields.timeIn}<input type="datetime-local" name="timeIn" defaultValue={toLocalInput(t.timeIn)} className={cls("timeIn")} /></label>
                <label>{mn.fields.timeOut}<input type="datetime-local" name="timeOut" defaultValue={toLocalInput(t.timeOut)} className={cls("timeOut")} /></label>
                <label>{mn.fields.printedAt}<input type="datetime-local" name="printedAt" defaultValue={toLocalInput(t.printedAt)} className={cls("printedAt")} /></label>
              </div>
            </fieldset>
            {!check.ok && <p className="error">Жингийн шалгалт: {check.message}</p>}

            <dl className="muted" style={{ margin: 0 }}>
              <div>{mn.fields.driverName}: {[t.driverName, t.driverRegisterNo, t.driverPhone].filter(Boolean).join(", ") || "—"}</div>
              <div>{mn.fields.consignorRaw}: {t.consignorRaw ?? "—"} · {mn.fields.buyerRaw}: {t.buyerRaw ?? "—"}</div>
              <div>{mn.fields.originRaw}: {t.originRaw ?? "—"} → {t.destinationRaw ?? "—"}</div>
              <div>Рейс: {t.trip ? <Link href={`/trips/${t.trip.id}`}>{t.trip.tripNo}</Link> : "батлахад автоматаар холбоно"}</div>
            </dl>

            {mayApprove && (
              <>
                <div className="row">
                  <button type="submit" name="op" value="approve">Батлах</button>
                </div>
                <div className="row">
                  <label style={{ flex: 1 }}>Татгалзах шалтгаан<input name="reason" /></label>
                  <button type="submit" name="op" value="reject" className="danger">Татгалзах</button>
                </div>
              </>
            )}
            {mayEdit && (
              <div className="row">
                <label style={{ flex: 1 }}>Засварын шалтгаан (заавал)<input name="reason" required /></label>
                <button type="submit" name="op" value="edit">Засвар хадгалах</button>
              </div>
            )}
            {pending && !can(user.role, "docs.approve") && <p className="muted">Зөвхөн нягтлан батална.</p>}
          </form>

          {log.length > 0 && (
            <>
              <h3>Өөрчлөлтийн түүх</h3>
              <table>
                <thead><tr><th>Цаг</th><th>Талбар</th><th>Өмнө</th><th>Дараа</th><th>Шалтгаан</th></tr></thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id}><td>{fmtDateTime(l.changedAt)}</td><td>{l.field}</td><td>{l.oldValue ?? "—"}</td><td>{l.newValue ?? "—"}</td><td>{l.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="muted">Ачаа жин: {fmtKg(t.netKg)}</p>
        </div>
      </div>
    </>
  );
}
