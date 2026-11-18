import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtDate } from "@/lib/format";
import { CoverBadge } from "./CoverBadge";

export default async function FleetPage() {
  const user = await requirePermission("fleet.view");
  const vehicles = await db.vehicle.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    include: {
      policies: { where: { deletedAt: null }, orderBy: { endDate: "desc" } },
      rigsAsTractor: { where: { validTo: null }, include: { trailer1: true, trailer2: true, driver: true } },
    },
    orderBy: [{ kind: "asc" }, { plateNo: "asc" }],
  });
  return (
    <>
      <h2>{mn.nav.fleet}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Дугаар</th><th>Төрөл</th><th>Чиргүүл</th><th>Жолооч</th><th>Даатгал</th><th>Үзлэг</th></tr></thead>
          <tbody>
            {vehicles.map((v) => {
              const rig = v.rigsAsTractor[0];
              return (
                <tr key={v.id}>
                  <td><Link href={`/fleet/${v.id}`}>{v.plateNo}</Link></td>
                  <td>{mn.vehicleKind[v.kind]}</td>
                  <td>{rig ? [rig.trailer1?.plateNo, rig.trailer2?.plateNo].filter(Boolean).join(" + ") : ""}</td>
                  <td>{rig?.driver?.fullName ?? ""}</td>
                  <td><CoverBadge end={v.policies[0]?.endDate ?? null} /></td>
                  <td>{fmtDate(v.inspectionExpiry)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
