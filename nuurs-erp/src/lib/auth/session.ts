import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { newToken, sha256 } from "./password";
import { can, type Action, type Role } from "./permissions";

const COOKIE = "nuurs_session";

export type CurrentUser = { id: string; name: string; role: Role; companyId: string; driverId: string | null };

export async function createSession(userId: string): Promise<void> {
  const days = Number(process.env.SESSION_DAYS ?? "14");
  const token = newToken();
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active || s.user.deletedAt) return null;
  const u = s.user;
  return { id: u.id, name: u.name, role: u.role, companyId: u.companyId, driverId: u.driverId };
}

/** For pages: send anonymous visitors to the login page. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`Эрх хүрэхгүй байна (${action})`);
  }
}

/** For pages and actions: the user must hold the permission, or the request is refused. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, action)) {
    // A driver who opens an office link goes back to their own page; anyone else is refused.
    if (u.role === "DRIVER") redirect("/driver");
    throw new ForbiddenError(action);
  }
  return u;
}
