import { and, desc, eq, like, or } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { alerts, approvals, households, memories } from "@/db/schema";
import { householdFrom, readJson, requireText, RouteError, routeError } from "@/lib/server/http";
import { createEmbedding } from "@/lib/server/providers/ai";
import { notifyCaregiver } from "@/lib/server/providers/email";

type NewMemory = {
  description?: string;
  objectLabels?: string[];
  occurredAt?: string;
  bestFrameKey?: string;
  videoKey?: string;
  boxes?: Array<{ label: string; confidence: number; x: number; y: number; width: number; height: number }>;
  importance?: "routine" | "important" | "safety";
  provenance?: "camera" | "patient" | "caregiver";
};

function withoutEmbedding<T extends { embedding?: unknown }>(memory: T) {
  const safeMemory = { ...memory };
  delete safeMemory.embedding;
  return safeMemory;
}

export async function GET(request: Request) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Memory storage is not configured yet");
    const householdId = householdFrom(request);
    const query = new URL(request.url).searchParams.get("q")?.trim();
    const where = query
      ? and(eq(memories.householdId, householdId), eq(memories.approvalState, "trusted"), or(like(memories.description, `%${query}%`), like(memories.objectLabels, `%${query}%`)))
      : and(eq(memories.householdId, householdId), eq(memories.approvalState, "trusted"));
    const rows = await db.select().from(memories).where(where).orderBy(desc(memories.occurredAt)).limit(30);
    return Response.json({ memories: rows.map(withoutEmbedding) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Memory storage is not configured yet");
    const householdId = householdFrom(request);
    const payload = await readJson<NewMemory>(request);
    const description = requireText(payload.description, "description", 2_000);
    const provenance = payload.provenance ?? "patient";
    const approvalState = provenance === "patient" ? "pending" : "trusted";
    const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new RouteError(400, "occurredAt is invalid");
    const id = crypto.randomUUID();
    const embedded = await createEmbedding(description).catch((error) => {
      console.warn("Embedding unavailable; storing lexical memory", error);
      return null;
    });

    await db.insert(households).values({ id: householdId }).onConflictDoNothing();
    const [memory] = await db.insert(memories).values({
      id,
      householdId,
      description,
      objectLabels: Array.isArray(payload.objectLabels) ? payload.objectLabels.slice(0, 30) : [],
      occurredAt: occurredAt.toISOString(),
      bestFrameKey: payload.bestFrameKey?.trim() || null,
      videoKey: payload.videoKey?.trim() || null,
      boxes: Array.isArray(payload.boxes) ? payload.boxes.slice(0, 50) : [],
      importance: payload.importance ?? "routine",
      approvalState,
      provenance,
      embedding: embedded?.embedding ?? null,
      embeddingModel: embedded?.model ?? null,
    }).returning();

    let notification: Awaited<ReturnType<typeof notifyCaregiver>> | null = null;
    if (approvalState === "pending") {
      await db.batch([
        db.insert(approvals).values({ id: crypto.randomUUID(), householdId, memoryId: id, statement: description }),
        db.insert(alerts).values({
          id: crypto.randomUUID(),
          householdId,
          type: "sensitive_memory",
          severity: payload.importance === "safety" ? "urgent" : "important",
          title: "Memory needs caregiver approval",
          message: description,
        }),
      ]);
      notification = await notifyCaregiver("[TOMO] Memory needs your approval", description).catch((error) => {
        console.error("Approval email failed", error);
        return { delivered: false, provider: "failed" as const, id: null };
      });
    }
    return Response.json({ memory: withoutEmbedding(memory), requiresApproval: approvalState === "pending", notification }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
