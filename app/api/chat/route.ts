import { and, desc, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { memories } from "@/db/schema";
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
    const payload = await readJson<{ message?: string; locale?: "en" | "ja" }>(request);
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
    const queryEmbedding = rows.length
      ? await createEmbedding(message).catch((error) => {
          console.warn("Semantic query embedding unavailable; using lexical retrieval", error);
          return null;
        })
      : null;
    const candidates = rows
      .map((memory) => {
        const searchable = `${memory.description} ${memory.objectLabels.join(" ")}`.toLocaleLowerCase(payload.locale === "ja" ? "ja-JP" : "en-US");
        const lexicalMatches = terms.filter((term) => searchable.includes(term)).length;
        const semantic = cosineSimilarity(queryEmbedding?.embedding ?? null, memory.embedding);
        return { memory, lexicalMatches, score: semantic + Math.min(0.35, lexicalMatches * 0.12) };
      })
      .filter((candidate) => candidate.lexicalMatches > 0 || candidate.score >= 0.25)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map(({ memory }) => memory);
    const context = candidates.map((memory, index) => `${index + 1}. ${memory.description} (${memory.occurredAt})`).join("\n");
    const fallback = candidates[0]
      ? `${candidates[0].description} This was recorded at ${new Date(candidates[0].occurredAt).toLocaleString(payload.locale === "ja" ? "ja-JP" : "en-US")}.`
      : payload.locale === "ja" ? "まだ信頼できる記憶が見つかりませんでした。介護者に確認してください。" : "I could not find a trusted memory for that yet. Please check with your caregiver.";
    const answer = await generateAnswer([
      { role: "system", content: "You are TOMO, a calm bilingual memory assistant. Answer only from the trusted memory context. Never invent a location, time, medicine, or safety fact. If context is insufficient, say so and suggest contacting the caregiver. Keep the answer concise." },
      { role: "user", content: `Locale: ${payload.locale ?? "en"}\nTrusted memory context:\n${context || "None"}\n\nQuestion: ${message}` },
    ], fallback);
    return Response.json({ answer: answer.text, provider: answer.provider, model: answer.model, evidence: candidates.map(({ id, description, occurredAt, bestFrameKey, boxes }) => ({ id, description, occurredAt, bestFrameKey, boxes })) });
  } catch (error) {
    return routeError(error);
  }
}
