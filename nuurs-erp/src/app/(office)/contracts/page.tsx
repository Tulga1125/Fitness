import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { mn } from "@/lib/i18n/mn";
import { fmtNum } from "@/lib/format";
import { addContractRate } from "../../actions/contracts";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("contracts.view");
  const sp = await searchParams;
  const contracts = await db.contract.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    include: { rates: { orderBy: { validFrom: "desc" } }, route: true, _count: { select: { trips: true } } },
    orderBy: { name: "asc" },
  });
  const edit = can(user.role, "contracts.edit");
  return (
    <>
      <h2>{mn.nav.contracts}</h2>
      {sp.error && <p className="error">{sp.error}</p>}
      <p className="muted">Ханш хугацаагаар өөрчлөгдөж болно. Рейсийн орлогыг ачилтын огноонд хүчинтэй ханшаар тооцно.</p>
      {contracts.map((c) => (
        <div className="panel" key={c.id} style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{c.name} <span className="muted">{c.contractNo} · {c._count.trips} рейс</span></h3>
          <div className="muted">
            {mn.rateType[c.rateType]}, {mn.weightBasis[c.billableWeightBasis]}, {c.currency}{c.vatIncluded ? ", НӨАТ орсон" : ""}
            {c.route ? ` · ${c.route.name}` : ""}
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Хүчинтэй</th><th className="num">Ханш</th></tr></thead>
            <tbody>
              {c.rates.map((r) => (
                <tr key={r.id}><td>{r.validFrom}-ээс</td><td className="num">{fmtNum(Number(r.rate), 2)} {c.currency}/тн</td></tr>
              ))}
            </tbody>
          </table>
          {edit && (
            <form action={addContractRate} className="row" style={{ marginTop: 10 }}>
              <input type="hidden" name="contractId" value={c.id} />
              <label>Шинэ ханш<input name="rate" inputMode="decimal" required /></label>
              <label>Хүчинтэй огноо<input type="date" name="validFrom" required /></label>
              <button type="submit">Нэмэх</button>
            </form>
          )}
        </div>
      ))}
    </>
  );
}
