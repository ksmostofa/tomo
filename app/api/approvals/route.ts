import { desc, eq } from "drizzle-orm";
import { getDbOptional } from "@/db";
import { approvals } from "@/db/schema";
import { householdFrom, RouteError, routeError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const db = getDbOptional();
    if (!db) throw new RouteError(503, "Approval storage is not configured yet");
    const rows = await db.select().from(approvals).where(eq(approvals.householdId, householdFrom(request))).orderBy(desc(approvals.submittedAt)).limit(30);
    return Response.json({ approvals: rows });
  } catch (error) {
    return routeError(error);
  }
}
