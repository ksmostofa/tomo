import { householdFrom, RouteError, routeError } from "@/lib/server/http";
import { getBindings } from "@/lib/server/runtime";

const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/webm": "webm",
  "video/mp4": "mp4",
};

export async function POST(request: Request) {
  try {
    const bucket = getBindings().EVIDENCE;
    if (!bucket) throw new RouteError(503, "Evidence storage is not configured yet");
    const householdId = householdFrom(request);
    const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
    const extension = extensions[contentType];
    if (!extension) throw new RouteError(415, "Evidence must be JPEG, PNG, WebP, WebM, or MP4");
    const declaredSize = Number(request.headers.get("content-length") ?? "0");
    if (declaredSize > MAX_EVIDENCE_BYTES) throw new RouteError(413, "Evidence is larger than 15 MB");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_EVIDENCE_BYTES) throw new RouteError(413, "Evidence must be between 1 byte and 15 MB");
    const kind = request.headers.get("x-tomo-evidence-kind") === "clip" ? "clip" : "frame";
    const day = new Date().toISOString().slice(0, 10);
    const key = `${householdId}/${day}/${crypto.randomUUID()}.${extension}`;
    await bucket.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: "private, no-store" },
      customMetadata: { householdId, kind },
    });
    return Response.json({ key, kind, bytes: bytes.byteLength }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function GET(request: Request) {
  try {
    const bucket = getBindings().EVIDENCE;
    if (!bucket) throw new RouteError(503, "Evidence storage is not configured yet");
    const householdId = householdFrom(request);
    const key = new URL(request.url).searchParams.get("key")?.trim();
    if (!key || !key.startsWith(`${householdId}/`)) throw new RouteError(404, "Evidence was not found");
    const object = await bucket.get(key);
    if (!object) throw new RouteError(404, "Evidence was not found");
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "x-tomo-household",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; media-src 'self' blob:",
    });
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  } catch (error) {
    return routeError(error);
  }
}
