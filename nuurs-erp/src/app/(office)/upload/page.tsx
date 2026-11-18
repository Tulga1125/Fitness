import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDateTime } from "@/lib/format";
import { retryUpload, uploadPhotos } from "../../actions/docs";

export default async function UploadPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("docs.upload");
  const sp = await searchParams;
  const [tractors, uploads] = await Promise.all([
    db.vehicle.findMany({ where: { companyId: user.companyId, kind: "TRACTOR", deletedAt: null }, orderBy: { plateNo: "asc" } }),
    db.upload.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <h2>{mn.nav.upload}</h2>
      {sp.stored && (
        <p className="notice">
          {sp.stored} зураг хүлээн авлаа{Number(sp.dup) > 0 ? `, ${sp.dup} нь өмнө ирсэн давхардал` : ""}.
        </p>
      )}
      {sp.error && <p className="error">{sp.error}</p>}
      <div className="panel">
        <form action={uploadPhotos} className="stack">
          <label>
            Пүүний баримт, түлшний баримт эсвэл колонкийн тоолуурын зураг
            <input type="file" name="photos" accept="image/*" multiple required />
          </label>
          <label>
            Машин (зурагнаас уншиж чадахгүй бол)
            <select name="tractorId" defaultValue="">
              <option value="">— зурагнаас таних —</option>
              {tractors.map((t) => (
                <option key={t.id} value={t.id}>{t.plateNo}</option>
              ))}
            </select>
          </label>
          <div><button type="submit">Оруулах</button></div>
        </form>
      </div>

      <h3>Сүүлд ирсэн зургууд</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Цаг</th><th>Төрөл</th><th>Төлөв</th><th>Тайлбар</th><th></th></tr>
          </thead>
          <tbody>
            {uploads.map((u) => (
              <tr key={u.id}>
                <td>{fmtDateTime(u.createdAt)}</td>
                <td>{u.classifiedAs ? mn.docType[u.classifiedAs as keyof typeof mn.docType] ?? u.classifiedAs : "—"}</td>
                <td>
                  <span className={`badge ${u.status === "FAILED" ? "bad" : u.status === "DONE" ? "ok" : ""}`}>{mn.extractionStatus[u.status]}</span>
                </td>
                <td className="muted">{u.error ?? ""}</td>
                <td>
                  {u.linkedTable && u.linkedId && (
                    <a href={`/approvals/${u.linkedTable === "weigh_tickets" ? "ticket" : "fuel"}/${u.linkedId}`}>Нээх</a>
                  )}
                  {u.status === "FAILED" && (
                    <form action={retryUpload}>
                      <input type="hidden" name="uploadId" value={u.id} />
                      <button className="secondary" type="submit">Дахин унших</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
