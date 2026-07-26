import { v } from "convex/values"

import { internalQuery, mutation, query } from "./_generated/server"
import { requireMembership, requireUser } from "./lib/authorization"

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const memberships = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()
    return Promise.all(memberships.map(async (membership) => ({ membership, household: await ctx.db.get(membership.householdId) })))
  },
})

export const create = mutation({
  args: {
    householdName: v.string(),
    displayName: v.string(),
    initialRole: v.union(v.literal("patient"), v.literal("caregiver")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", user._id)).first()
    if (existing) throw new Error("ALREADY_ONBOARDED")

    const now = Date.now()
    const householdId = await ctx.db.insert("households", {
      name: args.householdName.trim() || "TOMO household",
      createdBy: user._id,
      createdAt: now,
    })
    await ctx.db.insert("memberships", {
      householdId,
      userId: user._id,
      roles: [args.initialRole],
      displayName: args.displayName.trim() || user.name || "TOMO user",
      email: user.email,
      createdAt: now,
    })
    await ctx.db.insert("auditEvents", {
      householdId,
      actorUserId: user._id,
      action: "household.created",
      resourceType: "household",
      resourceId: householdId,
      metadata: { initialRole: args.initialRole },
      createdAt: now,
    })
    return householdId
  },
})

export const members = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.householdId)
    return ctx.db.query("memberships").withIndex("by_household", (q) => q.eq("householdId", args.householdId)).collect()
  },
})

export const membershipInternal = internalQuery({
  args: { householdId: v.id("households"), userId: v.string() },
  handler: (ctx, args) => ctx.db.query("memberships").withIndex("by_household_user", (q) => q.eq("householdId", args.householdId).eq("userId", args.userId)).unique(),
})

export const caregiverEmailsInternal = internalQuery({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => (await ctx.db.query("memberships").withIndex("by_household", (q) => q.eq("householdId", args.householdId)).collect())
    .filter((membership) => membership.roles.includes("caregiver") && membership.email)
    .map((membership) => membership.email as string),
})
