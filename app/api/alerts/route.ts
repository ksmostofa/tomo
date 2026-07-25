import { desc, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { alerts, households } from "@/db/schema";
import { householdFrom, readJson, requireText, RouteError, routeError } from "@/lib/server/http";
import { notifyCaregiver } from "@/lib/server/providers/email";

export async function GET(request: Request) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Alert storage is not configured yet");
    const rows = await db.select().from(alerts).where(eq(alerts.householdId, householdFrom(request))).orderBy(desc(alerts.createdAt)).limit(30);
    return Response.json({ alerts: rows });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Alert storage is not configured yet");
    const householdId = householdFrom(request);
    const payload = await readJson<{ type?: "possible_fall" | "sensitive_memory" | "reminder"; severity?: "info" | "important" | "urgent"; title?: string; message?: string; evidenceKey?: string }>(request);
    if (!payload.type) throw new RouteError(400, "type is required");
    const title = requireText(payload.title, "title", 160);
    const message = requireText(payload.message, "message", 2_000);
    await db.insert(households).values({ id: householdId }).onConflictDoNothing();
    const [alert] = await db.insert(alerts).values({ id: crypto.randomUUID(), householdId, type: payload.type, severity: payload.severity ?? "important", title, message, evidenceKey: payload.evidenceKey?.trim() || null }).returning();
    const notification = await notifyCaregiver(`[TOMO] ${title}`, message).catch((error) => {
      console.error("Caregiver email failed", error);
      return { delivered: false, provider: "failed" as const, id: null };
    });
    return Response.json({ alert, notification }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
