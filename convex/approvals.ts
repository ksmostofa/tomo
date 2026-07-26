import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireMembership } from "./lib/authorization"

export const pending = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId, "caregiver")
    return ctx.db.query("approvals").withIndex("by_household_state", (q) => q.eq("householdId", args.householdId).eq("state", "pending")).order("desc").take(50)
  },
})

export const resolve = mutation({
  args: { householdId: v.id("households"), approvalId: v.id("approvals"), decision: v.union(v.literal("approved"), v.literal("rejected")) },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId, "caregiver")
    const approval = await ctx.db.get(args.approvalId)
    if (!approval || approval.householdId !== args.householdId || approval.state !== "pending") throw new Error("NOT_FOUND")
    const memory = await ctx.db.get(approval.memoryId)
    if (!memory || memory.householdId !== args.householdId) throw new Error("NOT_FOUND")
    const now = Date.now()
    await ctx.db.patch(approval._id, { state: args.decision, resolvedBy: user._id, resolvedAt: now })
    await ctx.db.patch(memory._id, { approvalState: args.decision === "approved" ? "trusted" : "rejected" })
    await ctx.db.insert("auditEvents", { householdId: args.householdId, actorUserId: user._id, action: `memory.${args.decision}`, resourceType: "memory", resourceId: memory._id, metadata: { approvalId: approval._id }, createdAt: now })
  },
})
