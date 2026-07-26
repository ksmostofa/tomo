import type { GenericMutationCtx, GenericQueryCtx } from "convex/server"

import type { DataModel, Id } from "../_generated/dataModel"
import { authComponent } from "../auth"

type ReadCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
export type HouseholdRole = "patient" | "caregiver"

export async function requireUser(ctx: ReadCtx) {
  const user = await authComponent.getAuthUser(ctx)
  if (!user) throw new Error("UNAUTHENTICATED")
  return user
}

export async function requireMembership(
  ctx: ReadCtx,
  householdId: Id<"households">,
  requiredRole?: HouseholdRole,
) {
  const user = await requireUser(ctx)
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_household_user", (q) => q.eq("householdId", householdId).eq("userId", user._id))
    .unique()

  if (!membership || (requiredRole && !membership.roles.includes(requiredRole))) {
    throw new Error("FORBIDDEN")
  }
  return { user, membership }
}
