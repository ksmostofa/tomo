import { and, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { approvals, auditEvents, memories } from "@/db/schema";
import { householdFrom, readJson, RouteError, routeError } from "@/lib/server/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Approval storage is not configured yet");
    const householdId = householdFrom(request);
    const { id } = await context.params;
    const payload = await readJson<{ state?: "approved" | "rejected"; resolvedBy?: string }>(request);
    if (payload.state !== "approved" && payload.state !== "rejected") throw new RouteError(400, "state must be approved or rejected");
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, id), eq(approvals.householdId, householdId))).limit(1);
    if (!approval) throw new RouteError(404, "Approval was not found");
    if (approval.state !== "pending") throw new RouteError(409, "Approval has already been resolved");
    const resolvedAt = new Date().toISOString();
    await db.batch([
      db.update(approvals).set({ state: payload.state, resolvedAt, resolvedBy: payload.resolvedBy?.trim() || "caregiver" }).where(eq(approvals.id, id)),
      db.update(memories).set({ approvalState: payload.state === "approved" ? "trusted" : "rejected", updatedAt: resolvedAt }).where(eq(memories.id, approval.memoryId)),
      db.insert(auditEvents).values({ householdId, actor: payload.resolvedBy?.trim() || "caregiver", action: payload.state, resourceType: "memory", resourceId: approval.memoryId }),
    ]);
    return Response.json({ id, state: payload.state, memoryId: approval.memoryId });
  } catch (error) {
    return routeError(error);
  }
}
