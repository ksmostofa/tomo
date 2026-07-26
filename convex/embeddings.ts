import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"

type EmbeddingPayload = { data?: Array<{ embedding?: number[] }>; error?: { message?: string } }

export async function createEmbedding(text: string) {
  const apiKey = process.env.DASHSCOPE_API_KEY
  const baseUrl = process.env.QWEN_BASE_URL?.replace(/\/$/, "")
  const gatewayUrl = process.env.TOMO_AI_GATEWAY_URL?.replace(/\/$/, "")
  const gatewaySecret = process.env.AI_GATEWAY_SECRET
  if ((!apiKey || !baseUrl) && gatewayUrl && gatewaySecret) {
    const response = await fetch(`${gatewayUrl}/api/inference`, { method: "POST", headers: { Authorization: `Bearer ${gatewaySecret}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation: "embed", text }) })
    const payload = await response.json() as { embedding?: number[]; model?: string; error?: string }
    if (!response.ok || !payload.embedding || payload.embedding.length !== 1024) throw new Error(payload.error || "Embedding gateway failed")
    return { embedding: payload.embedding, model: payload.model || "cloudflare-qwen" }
  }
  if (!apiKey || !baseUrl) return null
  const model = process.env.QWEN_EMBEDDING_MODEL || "text-embedding-v4"
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text, dimensions: 1024 }),
  })
  const payload = await response.json() as EmbeddingPayload
  const embedding = payload.data?.[0]?.embedding
  if (!response.ok || !embedding || embedding.length !== 1024) throw new Error(payload.error?.message || "Embedding provider failed")
  return { embedding, model }
}

export const embedMemory = internalAction({
  args: { memoryId: v.id("memories"), text: v.string() },
  handler: async (ctx, args) => {
    const result = await createEmbedding(args.text)
    if (!result) return
    await ctx.runMutation(internal.memories.attachEmbeddingInternal, { memoryId: args.memoryId, embedding: result.embedding, embeddingModel: result.model })
  },
})
