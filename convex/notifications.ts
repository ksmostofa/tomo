import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalAction, internalMutation } from "./_generated/server"

export const recordInternal = internalMutation({
  args: {
    householdId: v.id("households"), resourceId: v.string(), channel: v.union(v.literal("in_app"), v.literal("email"), v.literal("push")),
    idempotencyKey: v.string(), status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("dead_letter")), attempts: v.number(), lastErrorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("notificationDeliveries").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique()
    if (existing) return ctx.db.patch(existing._id, { status: args.status, attempts: args.attempts, lastErrorCode: args.lastErrorCode, updatedAt: Date.now() })
    return ctx.db.insert("notificationDeliveries", { ...args, updatedAt: Date.now() })
  },
})

export const emailCaregivers = internalAction({
  args: { householdId: v.id("households"), resourceId: v.string(), subject: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const emails = await ctx.runQuery(internal.households.caregiverEmailsInternal, { householdId: args.householdId })
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    for (const email of emails) {
      const idempotencyKey = `${args.resourceId}:email:${email}`
      if (!apiKey || !from) {
        await ctx.runMutation(internal.notifications.recordInternal, { householdId: args.householdId, resourceId: args.resourceId, channel: "email", idempotencyKey, status: "failed", attempts: 0, lastErrorCode: "PROVIDER_NOT_CONFIGURED" })
        continue
      }
      try {
        const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ from, to: [email], subject: args.subject, text: args.text }) })
        await ctx.runMutation(internal.notifications.recordInternal, { householdId: args.householdId, resourceId: args.resourceId, channel: "email", idempotencyKey, status: response.ok ? "sent" : "failed", attempts: 1, lastErrorCode: response.ok ? undefined : `HTTP_${response.status}` })
      } catch {
        await ctx.runMutation(internal.notifications.recordInternal, { householdId: args.householdId, resourceId: args.resourceId, channel: "email", idempotencyKey, status: "failed", attempts: 1, lastErrorCode: "NETWORK_ERROR" })
      }
    }
  },
})
