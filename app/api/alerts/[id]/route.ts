import { and, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { alerts, auditEvents, memories } from "@/db/schema";
import { householdFrom, readJson, RouteError, routeError } from "@/lib/server/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Alert storage is not configured yet");
    const householdId = householdFrom(request);
    const { id } = await context.params;
    const payload = await readJson<{ status?: "checking" | "resolved"; actor?: string; videoKey?: string }>(request);
    if (payload.status !== "checking" && payload.status !== "resolved" && !payload.videoKey) throw new RouteError(400, "status or videoKey is required");
    const [existing] = await db.select().from(alerts).where(and(eq(alerts.id, id), eq(alerts.householdId, householdId))).limit(1);
    if (!existing) throw new RouteError(404, "Alert was not found");
    const resolvedAt = payload.status === "resolved" ? new Date().toISOString() : existing.resolvedAt;
    const [alert] = await db.update(alerts).set({
      ...(payload.status ? { status: payload.status, resolvedAt } : {}),
      ...(payload.videoKey ? { videoKey: payload.videoKey.trim() } : {}),
    }).where(and(eq(alerts.id, id), eq(alerts.householdId, householdId))).returning();
    if (payload.videoKey) {
      await db.update(memories).set({ videoKey: payload.videoKey.trim(), updatedAt: new Date().toISOString() })
        .where(and(eq(memories.id, `alert:${id}`), eq(memories.householdId, householdId)));
    }
    await db.insert(auditEvents).values({
      householdId,
      actor: payload.actor?.trim() || "caregiver",
      action: payload.status ?? "evidence_attached",
      resourceType: "alert",
      resourceId: id,
    });
    return Response.json({ alert });
  } catch (error) {
    return routeError(error);
  }
}
