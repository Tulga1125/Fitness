import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDate, fmtTonnes } from "@/lib/format";
import { uploadPhotos } from "../actions/docs";
import { logout } from "../actions/auth";

/** Phone-first page for drivers: my trips, upload a photo. Only the driver's own data is loaded. */
export default async function DriverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role !== "DRIVER") redirect("/");
  const sp = await searchParams;
  const trips = user.driverId
    ? await db.trip.findMany({
        where: { companyId: user.companyId, driverId: user.driverId, deletedAt: null },
        include: { tractor: true, contract: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];
  return (
    <div className="phone-page">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{user.name}</h2>
        <form action={logout}><button className="secondary" type="submit">{mn.nav.logout}</button></form>
      </div>

      <h3>Зураг илгээх</h3>
      {sp.stored && <p className="notice">Хүлээн авлаа. Нягтлан шалгаад батална.</p>}
      {Number(sp.dup) > 0 && <p className="muted">{sp.dup} зураг өмнө ирсэн байна.</p>}
      {sp.error && <p className="error">{sp.error}</p>}
      <form action={uploadPhotos} className="panel stack">
        <label>
          Пүүний баримт, түлшний баримт эсвэл колонкийн тоолуур
          <input type="file" name="photos" accept="image/*" capture="environment" multiple required />
        </label>
        <button type="submit">Илгээх</button>
      </form>

      <h3>Миний рейсүүд</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Огноо</th><th>Уурхай</th><th className="num">Жин</th><th>Төлөв</th></tr></thead>
          <tbody>
            {trips.length === 0 && <tr><td colSpan={4} className="muted">Рейс алга</td></tr>}
            {trips.map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.unloadedAt ?? t.loadedAt ?? t.createdAt)}</td>
                <td>{t.contract?.name ?? "—"}</td>
                <td className="num">{fmtTonnes(t.unloadedNetKg ?? t.loadedNetKg)}</td>
                <td>{mn.tripStatus[t.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Цалингийн хэсэг дараагийн шатанд нэмэгдэнэ.</p>
    </div>
  );
}
