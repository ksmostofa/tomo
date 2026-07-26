import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex, crossDomain } from "@convex-dev/better-auth/plugins"
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal"

import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import authConfig from "./auth.config"

export const authComponent = createClient<DataModel>(components.betterAuth)

export function createAuth(ctx: GenericCtx<DataModel>) {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error("SITE_URL is required")

  return betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  } satisfies BetterAuthOptions)
}
