import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { can, roleLabel } from "@/lib/auth/permissions";
import { mn } from "@/lib/i18n/mn";
import { logout } from "../actions/auth";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "DRIVER") redirect("/driver");
  const r = user.role;
  return (
    <div className="shell">
      <nav className="side">
        <h1>{mn.app}</h1>
        {can(r, "dashboard.view") && <Link href="/">{mn.nav.dashboard}</Link>}
        {can(r, "docs.view") && <Link href="/approvals">{mn.nav.approvals}</Link>}
        {can(r, "docs.upload") && <Link href="/upload">{mn.nav.upload}</Link>}
        {can(r, "trips.view") && <Link href="/trips">{mn.nav.trips}</Link>}
        {can(r, "fuelReport.view") && <Link href="/fuel">{mn.nav.fuel}</Link>}
        {can(r, "fleet.view") && <Link href="/fleet">{mn.nav.fleet}</Link>}
        {can(r, "contracts.view") && <Link href="/contracts">{mn.nav.contracts}</Link>}
        <div className="who">
          {user.name} · {roleLabel[r]}
        </div>
        <form action={logout}>
          <button className="secondary" type="submit">{mn.nav.logout}</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
