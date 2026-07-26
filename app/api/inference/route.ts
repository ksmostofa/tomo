import { getBindings } from "@/lib/server/runtime"

type RequestBody = { operation?: "chat" | "embed"; text?: string; system?: string }

export async function POST(request: Request) {
  const bindings = getBindings()
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bindings.AI_GATEWAY_SECRET || token !== bindings.AI_GATEWAY_SECRET) return Response.json({ error: "Forbidden" }, { status: 403 })
  if (!bindings.AI) return Response.json({ error: "AI binding unavailable" }, { status: 503 })
  const body = await request.json() as RequestBody
  const text = body.text?.trim()
  if (!text || text.length > 12_000) return Response.json({ error: "Invalid input" }, { status: 400 })
  if (body.operation === "embed") {
    const result = await bindings.AI.run("@cf/qwen/qwen3-embedding-0.6b", { text: [text] }) as { data?: number[][] }
    const embedding = result.data?.[0]
    return embedding ? Response.json({ embedding, model: "@cf/qwen/qwen3-embedding-0.6b" }) : Response.json({ error: "Embedding failed" }, { status: 502 })
  }
  if (body.operation === "chat") {
    const result = await bindings.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", { messages: [{ role: "system", content: body.system ?? "You are TOMO." }, { role: "user", content: text }], temperature: 0.2, max_tokens: 320 }) as { response?: string }
    return result.response ? Response.json({ answer: result.response, model: "@cf/qwen/qwen3-30b-a3b-fp8" }) : Response.json({ error: "Chat failed" }, { status: 502 })
  }
  return Response.json({ error: "Unsupported operation" }, { status: 400 })
}
