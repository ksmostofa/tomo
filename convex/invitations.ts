import { v } from "convex/values"

import { mutation } from "./_generated/server"
import { requireMembership, requireUser } from "./lib/authorization"

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function pairingCode() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toUpperCase()))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const createCaregiverInvite = mutation({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.householdId, "patient")
    const code = pairingCode()
    const now = Date.now()
    await ctx.db.insert("invitations", {
      householdId: args.householdId,
      tokenHash: await sha256(code),
      roles: ["caregiver"],
      createdBy: user._id,
      expiresAt: now + 10 * 60_000,
    })
    await ctx.db.insert("auditEvents", {
      householdId: args.householdId,
      actorUserId: user._id,
      action: "invitation.created",
      resourceType: "invitation",
      resourceId: "caregiver",
      metadata: { expiresAt: now + 10 * 60_000 },
      createdAt: now,
    })
    return { code, expiresAt: now + 10 * 60_000 }
  },
})

export const acceptCaregiverInvite = mutation({
  args: { code: v.string(), displayName: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", user._id)).first()
    if (existing) throw new Error("ALREADY_ONBOARDED")

    const tokenHash = await sha256(args.code)
    const invitation = await ctx.db.query("invitations").withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash)).unique()
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= Date.now()) throw new Error("INVALID_OR_EXPIRED_CODE")

    const now = Date.now()
    await ctx.db.patch(invitation._id, { acceptedAt: now })
    await ctx.db.insert("memberships", {
      householdId: invitation.householdId,
      userId: user._id,
      roles: ["caregiver"],
      displayName: args.displayName.trim() || user.name || "TOMO caregiver",
      email: user.email,
      createdAt: now,
    })
    await ctx.db.insert("auditEvents", {
      householdId: invitation.householdId,
      actorUserId: user._id,
      action: "invitation.accepted",
      resourceType: "invitation",
      resourceId: invitation._id,
      metadata: { roles: invitation.roles },
      createdAt: now,
    })
    return invitation.householdId
  },
})
