import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { storage } from "@/lib/storage";

/** Serves a stored photo or scan. Office roles see their company's files; drivers only what they uploaded. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const file = await db.storedFile.findFirst({ where: { id, companyId: user.companyId } });
  if (!file) return new Response("Not found", { status: 404 });
  if (!can(user.role, "docs.view") && file.uploadedBy !== user.id) return new Response("Forbidden", { status: 403 });
  const data = await storage.get(file.storageKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": file.mimeType, "Cache-Control": "private, max-age=86400" },
  });
}
