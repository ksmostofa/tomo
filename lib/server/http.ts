export class RouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "x-tomo-household",
  "X-Content-Type-Options": "nosniff",
};

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new RouteError(415, "Content-Type must be application/json");
  try {
    return await request.json() as T;
  } catch {
    throw new RouteError(400, "Request body must be valid JSON");
  }
}

export function routeError(error: unknown) {
  if (error instanceof RouteError) return Response.json({ error: error.message }, { status: error.status, headers: privateResponseHeaders });
  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500, headers: privateResponseHeaders });
}

export function requireText(value: unknown, field: string, maxLength = 4_000) {
  if (typeof value !== "string" || !value.trim()) throw new RouteError(400, `${field} is required`);
  const result = value.trim();
  if (result.length > maxLength) throw new RouteError(400, `${field} is too long`);
  return result;
}

export function householdFrom(request: Request): string;
export function householdFrom(request: Request, required: true): string;
export function householdFrom(request: Request, required: false): string | null;
export function householdFrom(request: Request, required = true): string | null {
  const value = request.headers.get("x-tomo-household")?.trim();
  if (value && /^[a-zA-Z0-9_-]{8,80}$/.test(value)) return value;
  if (required) throw new RouteError(400, "x-tomo-household is required");
  return null;
}
