import { and, desc, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { auditEvents, memories } from "@/db/schema";
import { householdFrom, readJson, requireText, routeError } from "@/lib/server/http";
import { createEmbedding, generateAnswer } from "@/lib/server/providers/ai";

function cosineSimilarity(left: number[] | null, right: number[] | null) {
  if (!left || !right || left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<{ message?: string; locale?: "en" | "ja"; audience?: "patient" | "caregiver" }>(request);
    const message = requireText(payload.message, "message", 2_000);
    const householdId = householdFrom(request, false);
    const db = getDbOptional();
    const terms = message
      .toLocaleLowerCase(payload.locale === "ja" ? "ja-JP" : "en-US")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 2)
      .slice(0, 6);
    const rows = db && householdId
      ? await db.select().from(memories).where(and(
          eq(memories.householdId, householdId),
          eq(memories.approvalState, "trusted"),
        )).orderBy(desc(memories.occurredAt)).limit(80)
      : [];
    const normalizedMessage = message.toLocaleLowerCase(payload.locale === "ja" ? "ja-JP" : "en-US");
    const canonicalSubject = /glasses|eyeglasses|spectacles|sunglasses|眼鏡|メガネ/.test(normalizedMessage)
      ? "glasses"
      : /\bkeys?\b|keyring|鍵|かぎ|キー/.test(normalizedMessage)
        ? "keys"
        : null;
    const subjectRows = canonicalSubject
      ? rows.filter((memory) => memory.objectLabels.some((label) => label.toLocaleLowerCase().includes(canonicalSubject)))
      : [];
    const retrievalPool = subjectRows.length ? subjectRows : rows;
    const queryEmbedding = retrievalPool.length
      ? await createEmbedding(message).catch((error) => {
          console.warn("Semantic query embedding unavailable; using lexical retrieval", error);
          return null;
        })
      : null;
    const ranked = retrievalPool
      .map((memory) => {
        const searchable = `${memory.description} ${memory.objectLabels.join(" ")}`.toLocaleLowerCase(payload.locale === "ja" ? "ja-JP" : "en-US");
        const lexicalMatches = terms.filter((term) => searchable.includes(term)).length;
        const semantic = cosineSimilarity(queryEmbedding?.embedding ?? null, memory.embedding);
        return { memory, lexicalMatches, score: semantic + Math.min(0.35, lexicalMatches * 0.12) };
      })
      .filter((candidate) => candidate.lexicalMatches > 0 || candidate.score >= 0.25)
      .sort((left, right) => right.score - left.score);
    const candidates = subjectRows.length
      ? ranked.sort((left, right) => Date.parse(right.memory.occurredAt) - Date.parse(left.memory.occurredAt)).slice(0, 6).map(({ memory }) => memory)
      : ranked.slice(0, 6).map(({ memory }) => memory);
    const primary = candidates[0] ?? null;
    const recentReceipts = db && householdId && canonicalSubject
      ? await db.select().from(auditEvents).where(and(
          eq(auditEvents.householdId, householdId),
          eq(auditEvents.action, "retrieval_answered"),
        )).orderBy(desc(auditEvents.createdAt)).limit(30)
      : [];
    const previousReceipt = recentReceipts.find((event) => event.metadata.subjectKey === canonicalSubject);
    const repeated = Boolean(primary && previousReceipt?.resourceId === primary.id);
    const context = candidates.map((memory, index) => `${index === 0 ? "CURRENT" : `HISTORY ${index}`}: ${memory.description} (${memory.occurredAt})`).join("\n");
    const fallback = primary
      ? repeated
        ? payload.locale === "ja"
          ? `先ほどもお伝えしましたが、${primary.description} まだ見つかりませんか？`
          : `I mentioned this earlier: ${primary.description} Have you still not found it?`
        : `${primary.description} This was recorded at ${new Date(primary.occurredAt).toLocaleString(payload.locale === "ja" ? "ja-JP" : "en-US")}.`
      : payload.locale === "ja" ? "まだ信頼できる記憶が見つかりませんでした。介護者に確認してください。" : "I could not find a trusted memory for that yet. Please check with your caregiver.";
    const answer = canonicalSubject || candidates.length === 0
      ? { text: fallback, provider: "deterministic" as const, model: null }
      : await generateAnswer([
          { role: "system", content: "You are TOMO, a calm bilingual memory assistant. Answer only from trusted memory. CURRENT is authoritative; HISTORY is context and must never replace a newer observation. Never invent a location, time, medicine, or safety fact. Keep the answer concise." },
          { role: "user", content: `Locale: ${payload.locale ?? "en"}\nAudience: ${payload.audience ?? "patient"}\nTrusted memory context:\n${context || "None"}\n\nQuestion: ${message}` },
        ], fallback);
    if (db && householdId && primary) {
      await db.insert(auditEvents).values({
        householdId,
        actor: payload.audience ?? "patient",
        action: "retrieval_answered",
        resourceType: "memory",
        resourceId: primary.id,
        metadata: { subjectKey: canonicalSubject, question: message, repeated, provider: answer.provider },
      });
    }
    return Response.json({
      answer: answer.text,
      provider: answer.provider,
      model: answer.model,
      repeated,
      latestObservedAt: primary?.occurredAt ?? null,
      evidence: candidates.map(({ id, description, occurredAt, bestFrameKey, evidenceDataUrl, boxes }) => ({ id, description, occurredAt, bestFrameKey, evidenceDataUrl, boxes })),
    });
  } catch (error) {
    return routeError(error);
  }
}
