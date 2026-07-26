import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"

import { authComponent, createAuth } from "./auth"
import { internal } from "./_generated/api"

const http = httpRouter()
authComponent.registerRoutes(http, createAuth, { cors: true })
http.route({ path: "/evidence/consume", method: "POST", handler: httpAction(async (ctx, request) => {
  const secret = process.env.EVIDENCE_GATEWAY_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 })
  const body = await request.json() as { token?: string; operation?: "read" | "write" }
  if (!body.token || (body.operation !== "read" && body.operation !== "write")) return new Response("Bad request", { status: 400 })
  const grant = await ctx.runMutation(internal.evidence.consume, { token: body.token, operation: body.operation })
  return grant ? Response.json(grant) : new Response("Invalid grant", { status: 403 })
}) })

export default http
