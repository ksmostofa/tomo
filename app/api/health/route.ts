import { providerStatus } from "@/lib/server/runtime";

export async function GET() {
  const providers = providerStatus();
  return Response.json({
    ok: true,
    service: "tomo",
    time: new Date().toISOString(),
    providers,
    ready: providers.database && providers.evidenceStorage,
  }, { headers: { "Cache-Control": "no-store" } });
}
