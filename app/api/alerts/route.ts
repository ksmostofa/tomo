import { and, desc, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { alerts, households, memories } from "@/db/schema";
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
    const payload = await readJson<{
      type?: "possible_fall" | "sensitive_memory" | "reminder";
      severity?: "info" | "important" | "urgent";
      title?: string;
      message?: string;
      evidenceKey?: string;
      evidenceDataUrl?: string;
      videoKey?: string;
      boxes?: Array<{ label: string; confidence: number; x: number; y: number; width: number; height: number }>;
    }>(request);
    if (!payload.type) throw new RouteError(400, "type is required");
    const title = requireText(payload.title, "title", 160);
    const message = requireText(payload.message, "message", 2_000);
    const evidenceDataUrl = payload.evidenceDataUrl?.trim() || null;
    if (evidenceDataUrl && (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(evidenceDataUrl) || evidenceDataUrl.length > 120_000)) {
      throw new RouteError(413, "Inline evidence must be a JPEG or WebP data URL smaller than 120 KB");
    }
    const boxes = (payload.boxes ?? []).slice(0, 10).map((box) => ({
      label: requireText(box.label, "box label", 80),
      confidence: Math.max(0, Math.min(1, Number(box.confidence) || 0)),
      x: Math.max(0, Math.min(1, Number(box.x) || 0)),
      y: Math.max(0, Math.min(1, Number(box.y) || 0)),
      width: Math.max(0, Math.min(1, Number(box.width) || 0)),
      height: Math.max(0, Math.min(1, Number(box.height) || 0)),
    }));
    if (payload.type === "possible_fall") {
      const [recent] = await db.select().from(alerts).where(and(
        eq(alerts.householdId, householdId),
        eq(alerts.type, "possible_fall"),
        eq(alerts.status, "open"),
      )).orderBy(desc(alerts.createdAt)).limit(1);
      if (recent && Date.now() - Date.parse(`${recent.createdAt.replace(" ", "T")}Z`) < 10 * 60_000) {
        if ((!recent.evidenceDataUrl && evidenceDataUrl) || (!recent.videoKey && payload.videoKey)) {
          const [enriched] = await db.update(alerts).set({
            evidenceDataUrl: recent.evidenceDataUrl || evidenceDataUrl,
            videoKey: recent.videoKey || payload.videoKey?.trim() || null,
            boxes: recent.boxes.length ? recent.boxes : boxes,
          }).where(eq(alerts.id, recent.id)).returning();
          return Response.json({ alert: enriched, notification: null, deduplicated: true });
        }
        return Response.json({ alert: recent, notification: null, deduplicated: true });
      }
    }
    await db.insert(households).values({ id: householdId }).onConflictDoNothing();
    const [alert] = await db.insert(alerts).values({
      id: crypto.randomUUID(), householdId, type: payload.type,
      severity: payload.severity ?? "important", title, message,
      evidenceKey: payload.evidenceKey?.trim() || null,
      evidenceDataUrl,
      videoKey: payload.videoKey?.trim() || null,
      boxes,
    }).returning();
    if (payload.type === "possible_fall") {
      await db.insert(memories).values({
        id: `alert:${alert.id}`,
        householdId,
        description: `${title}. ${message}`,
        objectLabels: ["possible fall", "person", "safety event"],
        occurredAt: new Date().toISOString(),
        bestFrameKey: payload.evidenceKey?.trim() || null,
        evidenceDataUrl,
        videoKey: payload.videoKey?.trim() || null,
        boxes,
        importance: "safety",
        approvalState: "trusted",
        provenance: "camera",
      }).onConflictDoNothing();
    }
    const notification = await notifyCaregiver(`[TOMO] ${title}`, message).catch((error) => {
      console.error("Caregiver email failed", error);
      return { delivered: false, provider: "failed" as const, id: null };
    });
    return Response.json({ alert, notification }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
