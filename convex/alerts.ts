import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireMembership } from "./lib/authorization"

const box = v.object({ label: v.string(), confidence: v.number(), x: v.number(), y: v.number(), width: v.number(), height: v.number() })

export const list = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId, "caregiver")
    return ctx.db.query("alerts").withIndex("by_household_time", (q) => q.eq("householdId", args.householdId)).order("desc").take(50)
  },
})

export const openPossibleFall = mutation({
  args: {
    householdId: v.id("households"),
    patientUserId: v.string(),
    fingerprint: v.string(),
    message: v.string(),
    evidenceKey: v.optional(v.string()),
    clipKey: v.optional(v.string()),
    boxes: v.array(box),
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId, "patient")
    const existing = await ctx.db.query("alerts")
      .withIndex("by_household_fingerprint", (q) => q.eq("householdId", args.householdId).eq("fingerprint", args.fingerprint))
      .filter((q) => q.neq(q.field("status"), "resolved"))
      .first()
    if (existing) return existing._id

    const now = Date.now()
    const alertId = await ctx.db.insert("alerts", {
      ...args,
      type: "possible_fall",
      severity: "urgent",
      status: "open",
      title: "Possible fall — check recommended",
      createdAt: now,
    })
    await ctx.db.insert("auditEvents", {
      householdId: args.householdId,
      actorUserId: user._id,
      action: "alert.opened",
      resourceType: "alert",
      resourceId: alertId,
      metadata: { fingerprint: args.fingerprint },
      createdAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.notifications.emailCaregivers, {
      householdId: args.householdId,
      resourceId: alertId,
      subject: "[TOMO] Possible fall — please check",
      text: args.message,
    })
    return alertId
  },
})

export const setStatus = mutation({
  args: { householdId: v.id("households"), alertId: v.id("alerts"), status: v.union(v.literal("checking"), v.literal("resolved")), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId, "caregiver")
    const alert = await ctx.db.get(args.alertId)
    if (!alert || alert.householdId !== args.householdId) throw new Error("NOT_FOUND")
    const now = Date.now()
    await ctx.db.patch(args.alertId, { status: args.status, resolvedAt: args.status === "resolved" ? now : undefined })
    await ctx.db.insert("auditEvents", {
      householdId: args.householdId,
      actorUserId: user._id,
      action: `alert.${args.status}`,
      resourceType: "alert",
      resourceId: args.alertId,
      metadata: { reason: args.reason },
      createdAt: now,
    })
  },
})
