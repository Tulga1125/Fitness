import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { toLocalInput } from "@/lib/format";
import { decideFuel } from "../../../../actions/docs";
import { ZoomImage } from "../../ZoomImage";

const LOW_MAP: Record<string, string> = {
  plate: "plateRaw", litres: "litres", unit_price: "unitPrice", currency: "currency", amount: "amount", filled_at: "filledAt", station: "stationRaw",
};

export default async function FuelReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("docs.view");
  const { id } = await params;
  const sp = await searchParams;
  const f = await db.fuelEntry.findFirst({ where: { id, companyId: user.companyId }, include: { trip: true } });
  if (!f) notFound();
  const low = new Set(f.lowConfidenceFields.map((k) => LOW_MAP[k] ?? k));
  const cls = (name: string) => (low.has(name) ? "low" : undefined);
  const mayApprove = f.status === "PENDING" && can(user.role, "docs.approve");
  const images = [f.meterImageFileId, f.receiptImageFileId].filter((x): x is string => !!x);

  return (
    <>
      <p><Link href="/approvals">← {mn.nav.approvals}</Link></p>
      <h2>
        Түлш · {f.plateRaw ?? "дугааргүй"}{" "}
        <span className={`badge ${f.status === "APPROVED" ? "ok" : f.status === "REJECTED" ? "bad" : "warn"}`}>{mn.recordStatus[f.status]}</span>
      </h2>
      {sp.error && <p className="error">{sp.error}</p>}
      <div className="review">
        <div className="photo panel">
          {images.length === 0 && <p className="muted">Зураггүй (импортоор орсон)</p>}
          {images.map((img) => <ZoomImage key={img} src={`/files/${img}`} alt="Түлшний баримт" />)}
        </div>
        <div className="panel">
          <form action={decideFuel} className="stack">
            <input type="hidden" name="id" value={f.id} />
            <fieldset disabled={!mayApprove} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="fields2">
                <label>{mn.fields.plateRaw}<input name="plateRaw" defaultValue={f.plateRaw ?? ""} className={cls("plateRaw")} /></label>
                <label>{mn.fields.litres}<input name="litres" inputMode="decimal" defaultValue={f.litres} className={cls("litres")} /></label>
                <label>{mn.fields.unitPrice}<input name="unitPrice" inputMode="decimal" defaultValue={f.unitPrice?.toString() ?? ""} className={cls("unitPrice")} /></label>
                <label>{mn.fields.currency}
                  <select name="currency" defaultValue={f.currency ?? ""} className={cls("currency")}>
                    <option value="">—</option><option value="CNY">CNY (юань)</option><option value="MNT">MNT (₮)</option>
                  </select>
                </label>
                <label>{mn.fields.amount}<input name="amount" inputMode="decimal" defaultValue={f.amount?.toString() ?? ""} className={cls("amount")} /></label>
                <label>{mn.fields.filledAt}<input type="datetime-local" name="filledAt" defaultValue={toLocalInput(f.filledAt)} className={cls("filledAt")} /></label>
                <label>{mn.fields.stationRaw}<input name="stationRaw" defaultValue={f.stationRaw ?? ""} className={cls("stationRaw")} /></label>
              </div>
            </fieldset>
            <p className="muted">
              Үнэгүй бол колонкийн бүртгэлийн үнэ, түүнгүй бол 6 000 ₮/л-ээр ойролцоогоор тооцно.
              {f.trip && <> Рейс: <Link href={`/trips/${f.trip.id}`}>{f.trip.tripNo}</Link></>}
            </p>
            {mayApprove && (
              <>
                <div className="row"><button type="submit" name="op" value="approve">Батлах</button></div>
                <div className="row">
                  <label style={{ flex: 1 }}>Татгалзах шалтгаан<input name="reason" /></label>
                  <button type="submit" name="op" value="reject" className="danger">Татгалзах</button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
