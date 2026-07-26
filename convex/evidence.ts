import { v } from "convex/values"

import { internalMutation, mutation } from "./_generated/server"
import { requireMembership } from "./lib/authorization"

const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/webm": "webm", "video/mp4": "mp4" }

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function rawToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "")
}

export const issueWrite = mutation({
  args: { householdId: v.id("households"), contentType: v.string(), kind: v.union(v.literal("frame"), v.literal("clip")) },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId, "patient")
    const extension = extensions[args.contentType]
    if (!extension) throw new Error("UNSUPPORTED_CONTENT_TYPE")
    const token = rawToken()
    const objectKey = `${args.householdId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`
    const expiresAt = Date.now() + 2 * 60_000
    await ctx.db.insert("evidenceGrants", { householdId: args.householdId, userId: user._id, tokenHash: await sha256(token), operation: "write", objectKey, contentType: args.contentType, expiresAt, createdAt: Date.now() })
    return { token, objectKey, expiresAt }
  },
})

export const issueRead = mutation({
  args: { householdId: v.id("households"), objectKey: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId)
    if (!args.objectKey.startsWith(`${args.householdId}/`)) throw new Error("NOT_FOUND")
    const memories = await ctx.db.query("memories").withIndex("by_household_time", (q) => q.eq("householdId", args.householdId)).order("desc").take(200)
    const alerts = await ctx.db.query("alerts").withIndex("by_household_time", (q) => q.eq("householdId", args.householdId)).order("desc").take(200)
    const linked = memories.some((memory) => memory.bestFrameKey === args.objectKey || memory.clipKey === args.objectKey)
      || alerts.some((alert) => alert.evidenceKey === args.objectKey || alert.clipKey === args.objectKey)
    if (!linked) throw new Error("NOT_FOUND")
    const token = rawToken()
    const expiresAt = Date.now() + 60_000
    await ctx.db.insert("evidenceGrants", { householdId: args.householdId, userId: user._id, tokenHash: await sha256(token), operation: "read", objectKey: args.objectKey, expiresAt, createdAt: Date.now() })
    return { token, expiresAt }
  },
})

export const consume = internalMutation({
  args: { token: v.string(), operation: v.union(v.literal("read"), v.literal("write")) },
  handler: async (ctx, args) => {
    const tokenHash = await sha256(args.token)
    const grant = await ctx.db.query("evidenceGrants").withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash)).unique()
    if (!grant || grant.operation !== args.operation || grant.consumedAt || grant.expiresAt <= Date.now()) return null
    await ctx.db.patch(grant._id, { consumedAt: Date.now() })
    return { householdId: grant.householdId, objectKey: grant.objectKey, contentType: grant.contentType }
  },
})
