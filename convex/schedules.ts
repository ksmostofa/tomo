import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireMembership } from "./lib/authorization"

export const upcoming = query({
  args: { householdId: v.id("households"), from: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId)
    return ctx.db.query("schedules").withIndex("by_household_start", (q) => q.eq("householdId", args.householdId).gte("startsAt", args.from ?? Date.now())).order("asc").take(30)
  },
})

export const create = mutation({
  args: { householdId: v.id("households"), patientUserId: v.string(), title: v.string(), startsAt: v.number(), reminderAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId, "caregiver")
    const now = Date.now()
    const scheduleId = await ctx.db.insert("schedules", { ...args, title: args.title.trim(), status: "scheduled", createdBy: user._id, createdAt: now })
    await ctx.db.insert("auditEvents", { householdId: args.householdId, actorUserId: user._id, action: "schedule.created", resourceType: "schedule", resourceId: scheduleId, metadata: { startsAt: args.startsAt }, createdAt: now })
    return scheduleId
  },
})

export const setStatus = mutation({
  args: { householdId: v.id("households"), scheduleId: v.id("schedules"), status: v.union(v.literal("done"), v.literal("cancelled")) },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId, "caregiver")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule || schedule.householdId !== args.householdId) throw new Error("NOT_FOUND")
    await ctx.db.patch(args.scheduleId, { status: args.status })
  },
})
