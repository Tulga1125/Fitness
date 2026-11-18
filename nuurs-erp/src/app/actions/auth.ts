"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizePhone, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export async function login(formData: FormData) {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const secret = String(formData.get("password") ?? "");
  const users = await db.user.findMany({ where: { phone, active: true, deletedAt: null } });
  let ok = null;
  for (const u of users) if (await verifyPassword(secret, u.passwordHash)) ok = u;
  if (!ok) redirect("/login?error=1");
  await createSession(ok.id);
  redirect(ok.role === "DRIVER" ? "/driver" : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
