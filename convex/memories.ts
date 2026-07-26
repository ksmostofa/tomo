import { v } from "convex/values"

import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireMembership } from "./lib/authorization"

const box = v.object({ label: v.string(), confidence: v.number(), x: v.number(), y: v.number(), width: v.number(), height: v.number() })

export const recent = query({
  args: { householdId: v.id("households"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId)
    return ctx.db
      .query("memories")
      .withIndex("by_household_time", (q) => q.eq("householdId", args.householdId))
      .order("desc")
      .take(Math.min(50, Math.max(1, args.limit ?? 20)))
  },
})

export const recentTrusted = query({
  args: { householdId: v.id("households"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId)
    const rows = await ctx.db.query("memories").withIndex("by_household_time", (q) => q.eq("householdId", args.householdId)).order("desc").take(100)
    return rows.filter((memory) => memory.approvalState === "trusted").slice(0, Math.min(30, Math.max(1, args.limit ?? 12)))
  },
})

export const recentTrustedInternal = internalQuery({
  args: { householdId: v.id("households"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("memories").withIndex("by_household_time", (q) => q.eq("householdId", args.householdId)).order("desc").take(100)
    return rows.filter((memory) => memory.approvalState === "trusted").slice(0, Math.min(30, Math.max(1, args.limit ?? 12)))
  },
})

export const byIdsInternal = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  handler: async (ctx, args) => (await Promise.all(args.ids.map((id) => ctx.db.get(id)))).filter((row) => row !== null),
})

export const attachEmbeddingInternal = internalMutation({
  args: { memoryId: v.id("memories"), embedding: v.array(v.float64()), embeddingModel: v.string() },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId)
    if (!memory) return
    await ctx.db.patch(args.memoryId, { embedding: args.embedding, embeddingModel: args.embeddingModel })
  },
})

export const latestForSubject = query({
  args: { householdId: v.id("households"), subjectKey: v.string() },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId)
    return ctx.db
      .query("memories")
      .withIndex("by_household_subject_time", (q) => q.eq("householdId", args.householdId).eq("subjectKey", args.subjectKey))
      .order("desc")
      .filter((q) => q.eq(q.field("approvalState"), "trusted"))
      .first()
  },
})

export const remember = mutation({
  args: {
    householdId: v.id("households"),
    patientUserId: v.string(),
    eventType: v.union(v.literal("object_placement"), v.literal("activity"), v.literal("routine"), v.literal("safety"), v.literal("profile")),
    subjectKey: v.optional(v.string()),
    description: v.string(),
    objectLabels: v.array(v.string()),
    boxes: v.array(box),
    occurredAt: v.number(),
    bestFrameKey: v.optional(v.string()),
    clipKey: v.optional(v.string()),
    provenance: v.union(v.literal("camera"), v.literal("patient"), v.literal("caregiver")),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireMembership(ctx, args.householdId)
    const isCaregiver = membership.roles.includes("caregiver")
    const approvalState = args.provenance === "patient" && !isCaregiver ? "pending" as const : "trusted" as const
    const previous = args.subjectKey
      ? await ctx.db.query("memories")
          .withIndex("by_household_subject_time", (q) => q.eq("householdId", args.householdId).eq("subjectKey", args.subjectKey))
          .order("desc").first()
      : null
    const now = Date.now()
    const memoryId = await ctx.db.insert("memories", {
      ...args,
      description: args.description.trim(),
      searchText: `${args.description} ${args.objectLabels.join(" ")} ${args.subjectKey ?? ""}`.toLocaleLowerCase(),
      approvalState,
      supersedesId: previous?._id,
      createdAt: now,
    })
    if (approvalState === "pending") {
      const approvalId = await ctx.db.insert("approvals", {
        householdId: args.householdId,
        memoryId,
        statement: args.description,
        state: "pending",
        submittedBy: user._id,
        submittedAt: now,
      })
      await ctx.scheduler.runAfter(0, internal.notifications.emailCaregivers, {
        householdId: args.householdId,
        resourceId: approvalId,
        subject: "[TOMO] Memory needs your approval",
        text: args.description,
      })
    }
    await ctx.db.insert("auditEvents", {
      householdId: args.householdId,
      actorUserId: user._id,
      action: approvalState === "pending" ? "memory.submitted" : "memory.created",
      resourceType: "memory",
      resourceId: memoryId,
      metadata: { provenance: args.provenance, subjectKey: args.subjectKey },
      createdAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.embeddings.embedMemory, { memoryId, text: `${args.description} ${args.objectLabels.join(" ")} ${args.subjectKey ?? ""}` })
    return { memoryId, approvalState }
  },
})
