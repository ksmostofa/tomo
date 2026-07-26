import { RouteError, routeError } from "@/lib/server/http";
import { getBindings } from "@/lib/server/runtime";

const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;

async function consumeGrant(request: Request, operation: "read" | "write") {
  const bindings = getBindings();
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new RouteError(401, "Evidence authorization is required");
  if (!bindings.CONVEX_SITE_URL || !bindings.EVIDENCE_GATEWAY_SECRET) throw new RouteError(503, "Evidence authorization is not configured");
  const response = await fetch(`${bindings.CONVEX_SITE_URL.replace(/\/$/, "")}/evidence/consume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bindings.EVIDENCE_GATEWAY_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ token, operation }),
  });
  if (!response.ok) throw new RouteError(response.status === 403 ? 403 : 502, "Evidence authorization failed");
  return response.json() as Promise<{ householdId: string; objectKey: string; contentType?: string }>;
}

export async function POST(request: Request) {
  try {
    const bucket = getBindings().EVIDENCE;
    if (!bucket) throw new RouteError(503, "Evidence storage is not configured yet");
    const grant = await consumeGrant(request, "write");
    const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
    if (!grant.contentType || contentType !== grant.contentType) throw new RouteError(415, "Evidence content type does not match its grant");
    const declaredSize = Number(request.headers.get("content-length") ?? "0");
    if (declaredSize > MAX_EVIDENCE_BYTES) throw new RouteError(413, "Evidence is larger than 15 MB");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_EVIDENCE_BYTES) throw new RouteError(413, "Evidence must be between 1 byte and 15 MB");
    await bucket.put(grant.objectKey, bytes, { httpMetadata: { contentType, cacheControl: "private, no-store" }, customMetadata: { householdId: grant.householdId } });
    return Response.json({ key: grant.objectKey, bytes: bytes.byteLength }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function GET(request: Request) {
  try {
    const bucket = getBindings().EVIDENCE;
    if (!bucket) throw new RouteError(503, "Evidence storage is not configured yet");
    const grant = await consumeGrant(request, "read");
    const object = await bucket.get(grant.objectKey);
    if (!object) throw new RouteError(404, "Evidence was not found");
    const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; media-src 'self' blob:" });
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  } catch (error) { return routeError(error); }
}
