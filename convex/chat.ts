import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { action } from "./_generated/server"
import { conversationalFallback } from "../lib/shared/chat-intent"
import { authComponent } from "./auth"
import { createEmbedding } from "./embeddings"

type ProviderPayload = { choices?: Array<{ message?: { content?: string } }> }
type ChatResult = { answer: string; provider: string; repeated: boolean; evidence: Doc<"memories">[] }

export const respond = action({
  args: {
    householdId: v.id("households"),
    message: v.string(),
    locale: v.union(v.literal("en"), v.literal("ja")),
    audience: v.union(v.literal("patient"), v.literal("caregiver")),
  },
  handler: async (ctx, args): Promise<ChatResult> => {
    const user = await authComponent.getAuthUser(ctx)
    if (!user) throw new Error("UNAUTHENTICATED")
    const membership = await ctx.runQuery(internal.households.membershipInternal, { householdId: args.householdId, userId: user._id })
    if (!membership || !membership.roles.includes(args.audience)) throw new Error("FORBIDDEN")
    const recent: Doc<"memories">[] = await ctx.runQuery(internal.memories.recentTrustedInternal, { householdId: args.householdId, limit: 16 })
    let semantic: Doc<"memories">[] = []
    try {
      const queryEmbedding = await createEmbedding(args.message)
      if (queryEmbedding) {
        const matches = await ctx.vectorSearch("memories", "by_embedding", { vector: queryEmbedding.embedding, limit: 12, filter: (q) => q.eq("householdId", args.householdId) })
        semantic = (await ctx.runQuery(internal.memories.byIdsInternal, { ids: matches.map((match) => match._id) })).filter((memory) => memory.approvalState === "trusted").slice(0, 8)
      }
    } catch (error) {
      console.warn("Semantic retrieval unavailable; using trusted recent memory", error)
    }
    const memories = [...semantic, ...recent.filter((row) => !semantic.some((candidate) => candidate._id === row._id))]
    const normalized = args.message.toLocaleLowerCase(args.locale === "ja" ? "ja-JP" : "en-US")
    const subjectKey = /glasses|eyeglasses|spectacles|眼鏡|メガネ/.test(normalized) ? "glasses" : /\bkeys?\b|keyring|鍵|かぎ|キー/.test(normalized) ? "keys" : null
    const needsTrustedContext = /\b(where|when|who|what (?:do|did|am|are|is)|remember|schedule|appointment|medicine|medication|allerg|daughter|son|caregiver)\b|どこ|いつ|誰|なに|何|予定|薬|覚え|娘|息子|介護/.test(normalized)
    const candidates = subjectKey
      ? memories.filter((memory) => memory.subjectKey === subjectKey || memory.objectLabels.some((label) => label.toLowerCase().includes(subjectKey)))
      : needsTrustedContext ? memories.slice(0, 8) : []
    const primary = candidates[0]
    if (subjectKey) {
      const previous = await ctx.runQuery(internal.receipts.latestInternal, { householdId: args.householdId, userId: user._id, subjectKey })
      const repeated = Boolean(previous?.memoryId && primary && previous.memoryId === primary._id)
      const answer = primary
        ? args.locale === "ja" ? `${primary.description} 記録時刻は${new Date(primary.occurredAt).toLocaleString("ja-JP")}です。${repeated ? " まだ見つかりませんか？" : ""}` : `${primary.description} This was recorded at ${new Date(primary.occurredAt).toLocaleString("en-US")}.${repeated ? " Have you not found it yet?" : ""}`
        : args.locale === "ja" ? "その物の信頼できる最新の場所はまだ記録されていません。" : "I do not have a trusted current location for that object yet."
      await ctx.runMutation(internal.receipts.saveInternal, { householdId: args.householdId, userId: user._id, subjectKey, question: args.message, answer, memoryId: primary?._id })
      return { answer, provider: "deterministic", repeated, evidence: primary ? [primary] : [] }
    }

    const fallback = conversationalFallback(args.message, args.locale, args.audience)
    const apiKey = process.env.DASHSCOPE_API_KEY
    const baseUrl = process.env.QWEN_BASE_URL?.replace(/\/$/, "")
    const context = candidates.map((memory, index) => `${index ? "HISTORY" : "CURRENT"}: ${memory.description}`).join("\n") || "None"
    const gatewayUrl = process.env.TOMO_AI_GATEWAY_URL?.replace(/\/$/, "")
    const gatewaySecret = process.env.AI_GATEWAY_SECRET
    const prompt = `Locale: ${args.locale}\nAudience: ${args.audience}\nTrusted context:\n${context}\n\nMessage: ${args.message}`
    const system = "You are TOMO, a warm bilingual companion. Converse naturally. Use trusted context only for personal facts, locations, schedules, medicine, or safety. Never invent those facts. Reply in the requested locale."
    if ((!apiKey || !baseUrl) && gatewayUrl && gatewaySecret) {
      const gatewayResponse = await fetch(`${gatewayUrl}/api/inference`, { method: "POST", headers: { Authorization: `Bearer ${gatewaySecret}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation: "chat", system, text: prompt }) })
      const gatewayPayload = await gatewayResponse.json() as { answer?: string }
      const answer = gatewayPayload.answer?.trim() || fallback
      return { answer, provider: gatewayPayload.answer ? "cloudflare-workers-ai" : "deterministic", repeated: false, evidence: candidates }
    }
    if (!apiKey || !baseUrl) return { answer: fallback, provider: "deterministic", repeated: false, evidence: candidates }
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.QWEN_CHAT_MODEL || "qwen3.6-flash", temperature: 0.2, max_tokens: 320, messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ] }),
    })
    const payload = await response.json() as ProviderPayload
    const answer = payload.choices?.[0]?.message?.content?.trim() || fallback
    return { answer, provider: answer === fallback ? "deterministic" : "qwen-cloud", repeated: false, evidence: candidates }
  },
})
