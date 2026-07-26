"use client"

import * as React from "react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"

import { authClient } from "@/lib/client/auth-client"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl, { expectAuth: true }) : null

export function TomoConvexProvider({ children }: { children: React.ReactNode }) {
  if (!convex) return <div role="alert">TOMO account services are not configured.</div>
  return <ConvexBetterAuthProvider client={convex} authClient={authClient}>{children}</ConvexBetterAuthProvider>
}
