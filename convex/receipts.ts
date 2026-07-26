import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

export const latestInternal = internalQuery({
  args: { householdId: v.id("households"), userId: v.string(), subjectKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.subjectKey) return ctx.db.query("conversationReceipts")
      .withIndex("by_household_user_subject", (q) => q.eq("householdId", args.householdId).eq("userId", args.userId).eq("subjectKey", args.subjectKey))
      .order("desc").first()
    return null
  },
})

export const saveInternal = internalMutation({
  args: { householdId: v.id("households"), userId: v.string(), subjectKey: v.optional(v.string()), question: v.string(), answer: v.string(), memoryId: v.optional(v.id("memories")) },
  handler: (ctx, args) => ctx.db.insert("conversationReceipts", { ...args, createdAt: Date.now() }),
})
